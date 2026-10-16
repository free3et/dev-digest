import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvalCaseOverrides, LLMProvider } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError } from '../src/platform/errors.js';
import { EvalService, type EvalServiceDeps } from '../src/modules/eval/service.js';
import { buildExpectation, toExpectationInput } from '../src/modules/eval/helpers.js';
import type { FindingScope } from '../src/modules/eval/types.js';

/**
 * Hermetic dry-run tests (Spec C AC-6, NFR-2, R-1/R-3 refusals): an
 * `EvalService` over stub repo + agents, so fake timers are safe (plan R10).
 */

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

function scope(over: Partial<FindingScope> = {}): FindingScope {
  return {
    finding_id: 'f-1',
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hard-coded key',
    accepted_at: new Date('2026-10-12T10:00:00Z'),
    dismissed_at: null,
    review_id: 'rev-1',
    agent_id: 'ag-1',
    run_id: null,
    pr_id: 'pr-1',
    pr_number: 7,
    pr_title: 'Add Stripe client',
    pr_body: 'Body',
    head_sha: 'abc',
    repo: 'acme/app',
    patch: PATCH,
    ...over,
  };
}

const AGENT = {
  id: 'ag-1',
  version: 3,
  provider: 'openrouter' as const,
  model: 'm',
  systemPrompt: 'sys',
};

function build(opts: {
  scope?: FindingScope | null;
  existingCase?: { id: string } | null;
  agent?: typeof AGENT | undefined;
  llm?: LLMProvider;
  llmSingleShot?: EvalServiceDeps['llmSingleShot'];
  caseTimeoutMs?: number;
}) {
  const sc = opts.scope === undefined ? scope() : opts.scope;
  const repo = {
    getFindingScope: vi.fn(async () => sc),
    findCaseBySourceFinding: vi.fn(async () => opts.existingCase ?? null),
    transaction: vi.fn(async () => {
      throw new Error('dry-run must not open a transaction');
    }),
    insertCase: vi.fn(async () => {
      throw new Error('dry-run must not insert');
    }),
  };
  const agents = {
    getById: vi.fn(async () => ('agent' in opts ? opts.agent : AGENT)),
    enabledSkillsForPrompt: vi.fn(async () => []),
  };
  const llmSingleShot =
    opts.llmSingleShot ?? vi.fn(async () => opts.llm ?? new MockLLMProvider('openrouter'));
  const service = new EvalService({
    repo: repo as never,
    agents,
    llmSingleShot,
    ...(opts.caseTimeoutMs ? { caseTimeoutMs: opts.caseTimeoutMs } : {}),
  });
  return { service, repo, agents, llmSingleShot };
}

const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 50, findings });
const found = (start: number) => ({
  id: 'x',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hard-coded key',
  file: 'src/config.ts',
  start_line: start,
  end_line: start,
  rationale: 'because',
  confidence: 0.9,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dryRunCase: failures become a 200 outcome error (AC-6)', () => {
  it('a never-resolving call times out with the billed-warning text (fake timers)', async () => {
    vi.useFakeTimers();
    const llm = new MockLLMProvider('openrouter', { structuredFn: () => new Promise(() => {}) });
    const { service } = build({ llm });
    const pending = service.dryRunCase('ws', 'f-1');
    await vi.advanceTimersByTimeAsync(120_001);
    const r = await pending;
    expect(r.outcome).toBe('error');
    expect(r.pass).toBeNull();
    expect(r.cost_usd).toBeNull();
    expect(r.error).toBe('timed out after 120 s (the call may still be billed)');
    expect(r.agent_version).toBe(3);
    expect(r.kept).toEqual([]);
  });

  it('the caseTimeoutMs seam shortens the wait', async () => {
    vi.useFakeTimers();
    const llm = new MockLLMProvider('openrouter', { structuredFn: () => new Promise(() => {}) });
    const { service } = build({ llm, caseTimeoutMs: 1000 });
    const pending = service.dryRunCase('ws', 'f-1');
    await vi.advanceTimersByTimeAsync(1001);
    expect((await pending).error).toBe('timed out after 1 s (the call may still be billed)');
  });

  it('a thrown key-like token is redacted', async () => {
    const llm = new MockLLMProvider('openrouter', {
      structuredFn: () => {
        throw new Error('bad sk-abcdefghijk123');
      },
    });
    const { service } = build({ llm });
    const r = await service.dryRunCase('ws', 'f-1');
    expect(r.outcome).toBe('error');
    expect(r.error).not.toContain('sk-abcdefghijk123');
    expect(r.error).toContain('[redacted]');
  });

  it('llmSingleShot rejecting with ConfigError is a 200 error result, not a throw (R5)', async () => {
    const { service } = build({
      llmSingleShot: async () => {
        throw new ConfigError('No API key for provider openrouter');
      },
    });
    const r = await service.dryRunCase('ws', 'f-1');
    expect(r.outcome).toBe('error');
    expect(r.error).toContain('No API key');
    expect(r.cost_usd).toBeNull();
    expect(r.pass).toBeNull();
  });
});

describe('dryRunCase: refusals make no model call', () => {
  const noCalls = (llm: MockLLMProvider) =>
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);

  const cases: [string, Parameters<typeof build>[0], string][] = [
    ['not_found', { scope: null }, 'not_found'],
    ['finding_undecided', { scope: scope({ accepted_at: null }) }, 'finding_undecided'],
    ['no_agent', { agent: undefined }, 'no_agent'],
    ['duplicate', { existingCase: { id: 'c-9' } }, 'duplicate'],
    ['patch_unavailable', { scope: scope({ patch: null }) }, 'patch_unavailable'],
  ];
  for (const [name, opts, code] of cases) {
    it(`R-1 ${name}`, async () => {
      const llm = new MockLLMProvider('openrouter', { structured: review([]) });
      const { service } = build({ ...opts, llm });
      const err = await service.dryRunCase('ws', 'f-1').catch((e) => e);
      if (code === 'not_found') {
        expect((err as { statusCode?: number }).statusCode).toBe(404);
      } else {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(code);
      }
      noCalls(llm);
    });
  }

  it('R-3 file_not_in_diff and kind_mismatch', async () => {
    const llm = new MockLLMProvider('openrouter', { structured: review([]) });
    const { service } = build({ llm });
    const base = toExpectationInput(buildExpectation(scope(), 'must_find', 'ag-1'));
    const a = await service
      .dryRunCase('ws', 'f-1', { expected_output: { ...base, file: 'other.ts' } })
      .catch((e) => e);
    expect((a as AppError).code).toBe('file_not_in_diff');
    const b = await service
      .dryRunCase('ws', 'f-1', { expected_output: { ...base, kind: 'must_not_flag' } })
      .catch((e) => e);
    expect((b as AppError).code).toBe('kind_mismatch');
    expect((b as AppError).statusCode).toBe(422);
    noCalls(llm);
  });
});

describe('dryRunCase: success path', () => {
  it('scores against the override, uses one call, writes nothing, logs one line', async () => {
    const llm = new MockLLMProvider('openrouter', { structured: review([found(11)]) });
    const { service, repo } = build({ llm });
    const info = vi.fn();
    const log = { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const passed = await service.dryRunCase('ws', 'f-1', undefined, log);
    expect(passed).toMatchObject({ outcome: 'passed', matched_count: 1, agent_version: 3 });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]![1]).toMatch(
      /^eval dry-run finding f-1: passed, cost \$0\.0010, \d+ ms$/,
    );

    const narrowed = toExpectationInput(buildExpectation(scope(), 'must_find', 'ag-1'));
    const failed = await service.dryRunCase('ws', 'f-1', {
      expected_output: { ...narrowed, start_line: 40, end_line: 41 },
    });
    expect(failed).toMatchObject({ outcome: 'failed', pass: false, matched_count: 0 });

    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);
    expect(repo.transaction).not.toHaveBeenCalled();
    expect(repo.insertCase).not.toHaveBeenCalled();
  });

  it('typed overrides stay assignable (compile-time)', () => {
    const o: EvalCaseOverrides = {};
    expect(o).toEqual({});
  });
});
