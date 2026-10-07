import { describe, it, expect, vi } from 'vitest';
import type { BriefModelOutput, LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { BriefService, type BriefContainer } from '../src/modules/brief/service.js';
import type { BriefRepo, PullScope } from '../src/modules/brief/repository.js';
import { MockContextDocStore } from '../src/adapters/mocks.js';
import { NotFoundError } from '../src/platform/errors.js';
import { LLM_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from '../src/modules/brief/constants.js';

const SECRET_TITLE = 'SECRET-TITLE-TEXT';

const scope = (over: Partial<PullScope> = {}): PullScope => ({
  id: 'pr1',
  repoId: 'repo1',
  number: 7,
  title: SECRET_TITLE,
  body: 'Closes #12',
  headSha: 'sha-head',
  owner: 'acme',
  name: 'api',
  ...over,
});

const OUTPUT: BriefModelOutput = {
  risks: [
    { kind: 'data', title: 'Low one', explanation: 'x', severity: 'low', file_refs: ['src/a.ts'] },
    { kind: 'security', title: 'High one', explanation: 'x', severity: 'high', file_refs: ['src/a.ts', 'invented.ts'] },
    { kind: 'other', title: 'Ghost', explanation: 'x', severity: 'high', file_refs: ['nope.ts'] },
  ],
  review_focus: [{ file: 'src/b.ts', line: 99, reason: 'look' }],
  summary: 'It changes things.',
};

interface Opts {
  scopeRow?: PullScope | undefined;
  llm?: (req: StructuredRequest<unknown>) => Promise<StructuredResult<unknown>>;
  github?: () => Promise<{ getIssue: (...a: unknown[]) => Promise<unknown> }>;
  intent?: unknown;
  blastDegraded?: boolean;
  docs?: Record<string, string>;
  agentLinks?: Record<string, { own: string[]; inherited: string[] }>;
  stored?: unknown;
}

function make(o: Opts = {}) {
  const requests: StructuredRequest<unknown>[] = [];
  const result = (req: StructuredRequest<unknown>): StructuredResult<unknown> => ({
    data: OUTPUT,
    model: req.model,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.0042,
    raw: '',
    attempts: 1,
  });
  const llmImpl = o.llm ?? (async (req) => result(req));
  const llmProvider = {
    id: 'openai',
    completeStructured: vi.fn(async (req: StructuredRequest<unknown>) => {
      requests.push(req);
      return llmImpl(req);
    }),
  } as unknown as LLMProvider;

  const upsertBrief = vi.fn(async () => undefined);
  const repo: BriefRepo = {
    getPullScope: vi.fn(async () => ('scopeRow' in o ? o.scopeRow : scope())),
    getBrief: vi.fn(async () => o.stored as never),
    upsertBrief,
  };
  const getIssue = vi.fn(async (_r: unknown, n: number) => ({ number: n, title: 'Issue title', body: 'issue body', state: 'open' }));
  const links = o.agentLinks ?? {};
  const container = {
    reviewRepo: {
      getIntent: vi.fn(async () => o.intent),
      getPrFiles: vi.fn(async () => [
        { path: 'src/a.ts', additions: 3, deletions: 1, patch: 'PATCH-A' },
        { path: 'src/b.ts', additions: 1, deletions: 0, patch: 'PATCH-B' },
      ]),
      reviewsForPull: vi.fn(async () => []),
      getPrCommits: vi.fn(async () => []),
      getRepo: vi.fn(async () => ({ clonePath: '/clone' })),
    },
    repoIntel: {
      getBlastRadius: vi.fn(async () =>
        o.blastDegraded
          ? { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true }
          : {
              changedSymbols: [{ file: 'src/a.ts', name: 'a', kind: 'function' }],
              callers: [{ file: 'src/c.ts', symbol: 'c', viaSymbol: 'a', line: 4, rank: 1 }],
              impactedEndpoints: [],
            },
      ),
    },
    contextDocs: new MockContextDocStore(o.docs ?? {}),
    contextDocLinksRepo: {
      agentDocs: vi.fn(async (id: string) => links[id]?.own ?? []),
      inheritedDocs: vi.fn(async (id: string) => (links[id]?.inherited ?? []).map((path) => ({ skillId: 's', skillName: 's', path }))),
    },
    agentsRepo: { listEnabled: vi.fn(async () => Object.keys(links).map((id) => ({ id }))) },
    llm: vi.fn(async () => llmProvider),
    github: o.github ?? (async () => ({ getIssue })),
    config: { contextRoots: ['specs', 'docs'] },
  } as unknown as BriefContainer;

  const service = new BriefService(
    { repo, container, resolveModel: async () => ({ provider: 'openai', model: 'test-model' }) },
    { llmTimeoutMs: 60, issueTimeoutMs: 30 },
  );
  return { service, repo, upsertBrief, llmProvider, requests, getIssue, container };
}

const lastPrId = () => 'pr1';

describe('BriefService.generate', () => {
  it('makes exactly one LLM call with the bounded request fields (H1) and upserts a grounded brief', async () => {
    const { service, llmProvider, requests, upsertBrief } = make();
    const info = vi.fn();
    const brief = await service.generate('w1', lastPrId(), { info, warn: vi.fn() } as never);

    expect(llmProvider.completeStructured).toHaveBeenCalledTimes(1);
    expect(requests[0]).toMatchObject({
      maxRetries: 0,
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: LLM_TIMEOUT_MS,
      schemaName: 'pr_brief',
      model: 'test-model',
    });
    // The patch never reaches the model (AC-7).
    expect(JSON.stringify(requests[0]!.messages)).not.toContain('PATCH-');

    expect(upsertBrief).toHaveBeenCalledTimes(1);
    expect(brief.head_sha).toBe('sha-head');
    expect(brief.cost_usd).toBe(0.0042); // L2: from the result, no priceBook
    expect(brief.risks.risks.map((r) => r.title)).toEqual(['High one', 'Low one']); // ghost dropped, sorted
    expect(brief.risks.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(brief.review_focus).toEqual([{ file: 'src/b.ts', line: null, reason: 'look' }]);
    expect(brief.missing_inputs).toEqual(expect.arrayContaining(['intent']));
    expect(brief.intent).toBeNull();
    expect(brief.blast).not.toBeNull();

    // NFR-6: one line, no PR text.
    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(info.mock.calls[0])).not.toContain(SECRET_TITLE);
  });

  it('marks intent and blast missing and stores them as null when neither is available', async () => {
    const { service } = make({ blastDegraded: true });
    const brief = await service.generate('w1', 'pr1');
    expect(brief.intent).toBeNull();
    expect(brief.blast).toBeNull();
    expect(brief.missing_inputs).toEqual(expect.arrayContaining(['intent', 'blast']));
  });

  it('409 brief_unavailable on invalid output, one call, no write', async () => {
    const { service, llmProvider, upsertBrief } = make({
      llm: async () => {
        throw new Error('fixture failed schema');
      },
    });
    await expect(service.generate('w1', 'pr1')).rejects.toMatchObject({ code: 'brief_unavailable', statusCode: 409 });
    expect(llmProvider.completeStructured).toHaveBeenCalledTimes(1);
    expect(upsertBrief).not.toHaveBeenCalled();
  });

  it('409 brief_unavailable when no provider key is configured', async () => {
    const { service, container, upsertBrief } = make();
    (container.llm as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('OPENAI_API_KEY is not configured'));
    await expect(service.generate('w1', 'pr1')).rejects.toMatchObject({ code: 'brief_unavailable', statusCode: 409 });
    expect(upsertBrief).not.toHaveBeenCalled();
  });

  it('rejects a second generate while the first is held open, then releases the guard (AC-25)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service, llmProvider } = make({
      llm: async (req) => {
        await gate;
        return { data: OUTPUT, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 };
      },
    });
    const service2 = new BriefService((service as unknown as { deps: never }).deps, { llmTimeoutMs: 5000 });
    const first = service2.generate('w1', 'pr1');
    await vi.waitFor(() => expect(llmProvider.completeStructured).toHaveBeenCalledTimes(1));
    await expect(service2.generate('w1', 'pr1')).rejects.toMatchObject({ code: 'brief_in_progress', statusCode: 409 });
    release();
    await first;
    expect(llmProvider.completeStructured).toHaveBeenCalledTimes(1);
    await expect(service2.generate('w1', 'pr1')).resolves.toBeTruthy(); // released in finally
  });

  it('times out into brief_unavailable and never persists a late result (EC-7)', async () => {
    const { service, upsertBrief, llmProvider } = make({
      llm: (req) =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ data: OUTPUT, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0.01, raw: '', attempts: 1 }),
            150,
          ),
        ),
    });
    await expect(service.generate('w1', 'pr1')).rejects.toMatchObject({ code: 'brief_unavailable' });
    await vi.waitFor(() => expect(llmProvider.completeStructured).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 250));
    expect(upsertBrief).not.toHaveBeenCalled();
  });

  it('fetches only the first same-repo issue; a failing fetch marks linked_issue missing', async () => {
    const ok = make({ scopeRow: scope({ body: 'Fixes #12 and #13' }) });
    const briefOk = await ok.service.generate('w1', 'pr1');
    expect(ok.getIssue).toHaveBeenCalledTimes(1);
    expect(briefOk.missing_inputs).not.toContain('linked_issue');

    const bad = make({
      scopeRow: scope({ body: 'Fixes #12' }),
      github: async () => {
        throw new Error('no token');
      },
    });
    expect((await bad.service.generate('w1', 'pr1')).missing_inputs).toContain('linked_issue');

    const none = make({ scopeRow: scope({ body: 'no refs' }) });
    expect((await none.service.generate('w1', 'pr1')).missing_inputs).not.toContain('linked_issue');
  });

  it('reads the union of attached specs documents once and ignores other doc types', async () => {
    const { service, requests, container } = make({
      docs: { 'specs/a.md': 'SPEC-A-BODY', 'docs/b.md': 'DOC-B-BODY' },
      agentLinks: {
        ag1: { own: ['specs/a.md', 'docs/b.md'], inherited: [] },
        ag2: { own: [], inherited: ['specs/a.md', 'specs/gone.md'] },
      },
    });
    const brief = await service.generate('w1', 'pr1');
    const prompt = JSON.stringify(requests[0]!.messages);
    expect(prompt).toContain('SPEC-A-BODY');
    expect(prompt).not.toContain('DOC-B-BODY');
    expect((container.contextDocs as MockContextDocStore).reads).toEqual(['specs/a.md']);
    // specs/gone.md is attached but unreadable
    expect(brief.missing_inputs).toContain('context_docs');
  });

  it('404s for a foreign PR without calling the LLM', async () => {
    const { service, llmProvider } = make({ scopeRow: undefined });
    await expect(service.generate('w1', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
    expect(llmProvider.completeStructured).not.toHaveBeenCalled();
  });
});

describe('BriefService.get', () => {
  it('returns {brief:null, stale:false} when nothing is stored and never calls the LLM', async () => {
    const { service, llmProvider } = make();
    await expect(service.get('w1', 'pr1')).resolves.toEqual({ brief: null, stale: false });
    expect(llmProvider.completeStructured).not.toHaveBeenCalled();
  });

  it('flags a brief generated for another head as stale', async () => {
    const stored = { head_sha: 'old' };
    const { service } = make({ stored });
    const res = await service.get('w1', 'pr1');
    expect(res.stale).toBe(true);
  });

  it('404s for a foreign PR', async () => {
    const { service } = make({ scopeRow: undefined });
    await expect(service.get('w1', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
