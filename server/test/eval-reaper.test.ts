import { describe, it, expect, vi } from 'vitest';
import { EvalService } from '../src/modules/eval/service.js';

/**
 * Spec A NFR-3: the boot reaper must not leave a suite `running` because an
 * earlier one failed. A stranded `running` row keeps its agent blocked by the
 * partial unique index (409 eval_run_in_progress) until the next boot.
 */
function suiteRow(id: string) {
  return {
    id,
    workspaceId: 'ws',
    casesTotal: 4,
    casesCompleted: 2,
    casesPassed: 1,
    casesErrored: 1,
  };
}

function makeService(repo: Record<string, unknown>): EvalService {
  return new EvalService({
    repo: repo as never,
    agents: {} as never,
    skills: {} as never,
    llmSingleShot: async () => {
      throw new Error('reaper must not call a model');
    },
  });
}

describe('EvalService.reapInterrupted', () => {
  it('finalises every running suite when none fails', async () => {
    const finalizeSuite = vi.fn(async () => undefined);
    const repo = {
      listRunningSuites: async () => [suiteRow('a'), suiteRow('b')],
      getSuiteDetail: async () => ({ runs: [] }),
      finalizeSuite,
    };
    await expect(makeService(repo).reapInterrupted()).resolves.toBe(2);
    expect(finalizeSuite).toHaveBeenCalledTimes(2);
  });

  it('keeps going after one suite fails to aggregate and closes it with the live counters', async () => {
    const calls: Array<{ id: string; status: string; error: string | null; recall: number | null }> = [];
    let first = true;
    const repo = {
      listRunningSuites: async () => [suiteRow('bad'), suiteRow('good')],
      getSuiteDetail: async (_ws: string, id: string) => {
        if (id === 'bad' && first) {
          first = false;
          throw new Error('boom');
        }
        return { runs: [] };
      },
      finalizeSuite: async (id: string, f: { status: string; error: string | null; recall: number | null }) => {
        calls.push({ id, status: f.status, error: f.error, recall: f.recall });
      },
    };
    await expect(makeService(repo).reapInterrupted()).resolves.toBe(2);
    expect(calls.map((c) => c.id).sort()).toEqual(['bad', 'good']);
    for (const c of calls) {
      expect(c.status).toBe('failed');
      expect(c.error).toBe('interrupted');
    }
    // the fallback path writes no metrics
    expect(calls.find((c) => c.id === 'bad')!.recall).toBeNull();
  });

  it('processes the remaining suites and then reports when a suite cannot be closed at all', async () => {
    const finalizeSuite = vi.fn(async (id: string) => {
      if (id === 'stuck') throw new Error('db down');
    });
    const repo = {
      listRunningSuites: async () => [suiteRow('stuck'), suiteRow('ok')],
      getSuiteDetail: async () => ({ runs: [] }),
      finalizeSuite,
    };
    await expect(makeService(repo).reapInterrupted()).rejects.toThrow(/could not reap 1 of 2/);
    expect(finalizeSuite.mock.calls.some((c) => c[0] === 'ok')).toBe(true);
  });
});
