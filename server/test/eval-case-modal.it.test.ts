import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  EvalCase,
  EvalCaseDraft,
  EvalDryRunResult,
  type StructuredRequest,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { evalFixtures, type EvalFixtures } from './helpers/eval-fixtures.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockContextDocStore,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';

/**
 * Spec C server AC-1..AC-9 + NFR-3/4/7 against a real Postgres. All three
 * providers are mocked (plan R6): no test here may spend money. The only
 * non-overridden provider is the deliberate no-key case, which is a
 * ConfigError before any call.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', ...extra } as NodeJS.ProcessEnv);

const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 50, findings });
const hit = (line = 11) => ({
  id: `h-${line}`,
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hard-coded Stripe key',
  file: 'src/config.ts',
  start_line: line,
  end_line: line,
  rationale: 'because',
  confidence: 0.9,
});

const EXCLUDED_HEADINGS = [
  '## Repo skeleton',
  '## Callers of changed symbols',
  '## Project context',
  '## Stated intent',
  '## Relevant memory',
];

d('eval case modal: draft + dry-run + save (Testcontainers pg)', () => {
  let pg: PgFixture;
  let fx: EvalFixtures;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    fx = await evalFixtures(pg);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  type Fn = (req: StructuredRequest<unknown>) => unknown | Promise<unknown>;
  function makeMocks(fn: Fn) {
    return {
      openai: new MockLLMProvider('openai', { structuredFn: fn }),
      anthropic: new MockLLMProvider('anthropic', { structuredFn: fn }),
      openrouter: new MockLLMProvider('openrouter', { structuredFn: fn }),
    };
  }
  type Mocks = ReturnType<typeof makeMocks>;
  const callsOf = (m: MockLLMProvider) => m.calls.filter((c) => c.method === 'completeStructured');
  const totalCalls = (m: Mocks) =>
    callsOf(m.openai).length + callsOf(m.anthropic).length + callsOf(m.openrouter).length;
  const allReqs = (m: Mocks) =>
    [...callsOf(m.openai), ...callsOf(m.anthropic), ...callsOf(m.openrouter)].map(
      (c) => c.req as StructuredRequest<unknown>,
    );
  const promptOf = (req: StructuredRequest<unknown>) => req.messages.map((x) => x.content).join('\n');

  const hitting = (line = 11) => makeMocks(() => review([hit(line)]));

  function appWith(mocks: Mocks, extra: Record<string, string> = {}) {
    return buildApp({
      config: config(extra),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({}),
        github: new MockGitHubClient(),
        contextDocs: new MockContextDocStore({}),
        llm: mocks,
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  const get = (app: App, id: string) =>
    app.inject({ method: 'GET', url: `/findings/${id}/eval-case/draft` });
  const dry = (app: App, id: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url: `/findings/${id}/eval-case/dry-run`,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const save = (app: App, id: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url: `/findings/${id}/eval-case`,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const err = (res: { json(): unknown }) =>
    (res.json() as { error: { code: string; details?: { case_id?: string } } }).error;

  const count = async (table: typeof t.evalCases | typeof t.evalRuns | typeof t.evalSuiteRuns | typeof t.agentRuns | typeof t.runTraces) =>
    (await pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;
  const counts = async () => ({
    cases: await count(t.evalCases),
    runs: await count(t.evalRuns),
    suites: await count(t.evalSuiteRuns),
    agentRuns: await count(t.agentRuns),
    traces: await count(t.runTraces),
  });

  /** An accepted finding with an agent: the common starting point. */
  async function accepted(extra: Parameters<EvalFixtures['makeFinding']>[0] = {}, agentOpts = {}) {
    const agentId = await fx.makeAgent(agentOpts);
    const f = await fx.makeFinding({ agentId, decided: 'accepted', ...extra });
    return { agentId, ...f };
  }

  // ---------------------------------------------------------------- AC-1

  it('draft equals the case a bodiless save creates, and the GET writes nothing (AC-1)', async () => {
    const f = await accepted();
    const mocks = hitting();
    const app = await appWith(mocks);
    const before = await counts();
    const res = await get(app, f.findingId);
    expect(res.statusCode).toBe(200);
    const draft = EvalCaseDraft.parse(res.json());
    expect(await counts()).toEqual(before);

    const created = EvalCase.parse((await save(app, f.findingId)).json());
    const { source, ...expectedMinusSource } = created.expected_output;
    expect(source.finding_id).toBe(f.findingId);
    expect(draft).toEqual({
      finding_id: f.findingId,
      agent_id: f.agentId,
      name: created.name,
      input_diff: created.input_diff,
      input_files: created.input_files,
      input_meta: created.input_meta,
      expected_output: expectedMinusSource,
    });
    expect(totalCalls(mocks)).toBe(0);
    await app.close();
  });

  // ---------------------------------------------------------------- AC-2, AC-3

  it('one call with maxRetries 0 / maxTokens 8192 / timeoutMs 120000; prompt = stored diff + PR text, no enrichment; prompt edit bumps agent_version (AC-2, AC-3)', async () => {
    const db = pg.handle.db;
    const f = await accepted({ prTitle: 'Harden billing', prBody: 'BODY_SENTINEL_TEXT' }, {
      systemPrompt: 'PROMPT_V1 review',
    });
    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId: fx.workspaceId,
        name: `Modal skill ${randomUUID().slice(0, 8)}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'Skill body text',
        enabled: true,
      })
      .returning();
    await db.insert(t.agentSkills).values({ agentId: f.agentId, skillId: skill!.id, order: 0, enabled: true });

    const mocks = hitting();
    const app = await appWith(mocks);
    const r1 = EvalDryRunResult.parse((await dry(app, f.findingId)).json());
    expect(totalCalls(mocks)).toBe(1);
    const req1 = allReqs(mocks)[0]!;
    expect(req1.maxRetries).toBe(0);
    expect(req1.maxTokens).toBe(8192);
    expect(req1.timeoutMs).toBe(120_000);

    const text1 = promptOf(req1);
    expect(text1).toContain('+  stripeKey: "sk_live_xxx"');
    expect(text1).toContain('Harden billing');
    expect(text1).toContain('BODY_SENTINEL_TEXT');
    expect(text1).toContain(`### ${skill!.name}`);
    for (const h of EXCLUDED_HEADINGS) expect(text1).not.toContain(h);
    expect(req1.messages.find((m) => m.role === 'system')!.content).toContain('PROMPT_V1');

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${f.agentId}`,
      payload: { system_prompt: 'PROMPT_V2 review' },
    });
    expect(put.statusCode).toBe(200);
    const r2 = EvalDryRunResult.parse((await dry(app, f.findingId)).json());
    expect(totalCalls(mocks)).toBe(2);
    expect(allReqs(mocks)[1]!.messages.find((m) => m.role === 'system')!.content).toContain('PROMPT_V2');
    expect(r2.agent_version).toBe(r1.agent_version + 1);
    await app.close();
  });

  // ---------------------------------------------------------------- AC-4

  it('a matching finding passes with matched_count 1; a narrowed range fails must_find (AC-4)', async () => {
    const f = await accepted({ start: 11, end: 12 });
    const mocks = hitting(11);
    const app = await appWith(mocks);
    const draft = EvalCaseDraft.parse((await get(app, f.findingId)).json());

    const passed = EvalDryRunResult.parse((await dry(app, f.findingId)).json());
    expect(passed).toMatchObject({
      outcome: 'passed',
      pass: true,
      matched: true,
      matched_count: 1,
      expectation_kind: 'must_find',
      error: null,
    });
    expect(passed.cost_usd).toBe(0.001);

    const narrowed = { ...draft.expected_output, start_line: 40, end_line: 41 };
    const failed = EvalDryRunResult.parse(
      (await dry(app, f.findingId, { expected_output: narrowed })).json(),
    );
    expect(failed).toMatchObject({ outcome: 'failed', pass: false, matched: false, matched_count: 0 });
    // the caller's expectation never reaches the model
    for (const req of allReqs(mocks)) expect(promptOf(req)).not.toContain('"start_line":40');
    await app.close();
  });

  // ---------------------------------------------------------------- AC-5

  it('a passed, a failed and an errored dry-run write nothing and publish no run event (AC-5)', async () => {
    const f = await accepted();
    let mode: 'hit' | 'miss' | 'throw' = 'hit';
    const mocks = makeMocks(() => {
      if (mode === 'throw') throw new Error('upstream 503');
      return review(mode === 'hit' ? [hit(11)] : []);
    });
    const app = await appWith(mocks);
    const publish = vi.spyOn(app.container.runBus, 'publish');
    const before = await counts();

    const outcomes: string[] = [];
    for (mode of ['hit', 'miss', 'throw'] as const) {
      const res = await dry(app, f.findingId);
      expect(res.statusCode).toBe(200);
      outcomes.push(EvalDryRunResult.parse(res.json()).outcome);
    }
    expect(outcomes).toEqual(['passed', 'failed', 'error']);
    expect(await counts()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
    publish.mockRestore();
    await app.close();
  });

  // ---------------------------------------------------------------- AC-6

  it('a missing provider key is a 200 outcome error, not a 500 (AC-6)', async () => {
    const f = await accepted({}, { provider: 'openrouter' });
    const openai = new MockLLMProvider('openai', { structured: review([]) });
    const anthropic = new MockLLMProvider('anthropic', { structured: review([]) });
    // openrouter is NOT overridden; the empty secrets store makes it a ConfigError, never a real call
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({}),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        llm: { openai, anthropic },
      },
    });
    const res = await dry(app, f.findingId);
    expect(res.statusCode).toBe(200);
    const body = EvalDryRunResult.parse(res.json());
    expect(body).toMatchObject({ outcome: 'error', pass: null, cost_usd: null, kept: [], dropped: [] });
    expect(body.error).toContain('OPENROUTER_API_KEY is not configured');
    expect(openai.calls).toHaveLength(0);
    expect(anthropic.calls).toHaveLength(0);
    await app.close();
  });

  it('a key-like token in a provider error comes back redacted (AC-6)', async () => {
    const f = await accepted();
    const app = await appWith(
      makeMocks(() => {
        throw new Error('provider said: bad sk-abcdefghijk123456');
      }),
    );
    const body = EvalDryRunResult.parse((await dry(app, f.findingId)).json());
    expect(body.outcome).toBe('error');
    expect(body.error).not.toContain('sk-abcdefghijk123456');
    expect(body.error).toContain('[redacted]');
    expect(body.error!.length).toBeLessThanOrEqual(300);
    await app.close();
  });

  // ---------------------------------------------------------------- AC-7, AC-8

  it('save with an edited name and narrowed range stores the supplied values (AC-7)', async () => {
    const f = await accepted({ start: 11, end: 14 });
    const app = await appWith(hitting());
    const draft = EvalCaseDraft.parse((await get(app, f.findingId)).json());
    const res = await save(app, f.findingId, {
      name: '  My own name  ',
      expected_output: { ...draft.expected_output, start_line: 12, end_line: 13, title: 'Edited title' },
    });
    expect(res.statusCode).toBe(201);
    const created = EvalCase.parse(res.json());
    expect(created.name).toBe('My own name');

    const [row] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, created.id));
    expect(row!.name).toBe('My own name');
    expect(row!.ownerId).toBe(f.agentId);
    expect(row!.expectedOutput).toMatchObject({
      kind: 'must_find',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 13,
      title: 'Edited title',
      source: { finding_id: f.findingId, review_id: f.reviewId, pr_id: f.prId, agent_id: f.agentId },
    });
    expect(row!.inputDiff).toBe(draft.input_diff);
    expect(row!.inputFiles).toEqual(draft.input_files);
    expect(row!.inputMeta).toEqual(draft.input_meta);
    await app.close();
  });

  it('an empty object and no payload give equal rows (AC-8)', async () => {
    const a = await accepted();
    const b = await accepted();
    const app = await appWith(hitting());
    const none = EvalCase.parse((await save(app, a.findingId)).json());
    const empty = (await save(app, b.findingId, {}));
    expect(empty.statusCode).toBe(201);
    const withBody = EvalCase.parse(empty.json());
    // same shape; ids / source differ because the findings differ
    expect(withBody.name).toBe(none.name);
    expect(withBody.input_diff).toBe(none.input_diff);
    expect(withBody.input_files).toEqual(none.input_files);
    const { source: s1, ...e1 } = none.expected_output;
    const { source: s2, ...e2 } = withBody.expected_output;
    expect(e2).toEqual(e1);
    expect(Object.keys(s2).sort()).toEqual(Object.keys(s1).sort());
    await app.close();
  });

  // ---------------------------------------------------------------- AC-9

  it('every R-1 row applies to draft, dry-run and save, with no model call and no case (AC-9)', async () => {
    const agentId = await fx.makeAgent();
    const mocks = hitting();
    const app = await appWith(mocks);
    const before = await counts();

    const foreignAgent = await fx.makeAgent({ ws: fx.foreignWorkspaceId });
    const foreign = await fx.makeFinding({
      ws: fx.foreignWorkspaceId,
      agentId: foreignAgent,
      decided: 'accepted',
    });
    const undecided = await fx.makeFinding({ agentId: null, decided: null, patch: null });
    const noAgent = await fx.makeFinding({ agentId: null, decided: 'accepted', patch: null });
    const noPatch = await fx.makeFinding({ agentId, decided: 'accepted', patch: null });

    const rows: [string, string, number, string][] = [
      ['not_found (unknown)', randomUUID(), 404, 'not_found'],
      ['not_found (foreign)', foreign.findingId, 404, 'not_found'],
      ['finding_undecided', undecided.findingId, 409, 'finding_undecided'],
      ['no_agent', noAgent.findingId, 409, 'no_agent'],
      ['patch_unavailable', noPatch.findingId, 409, 'patch_unavailable'],
    ];
    for (const [label, id, status, code] of rows) {
      for (const [ep, res] of [
        ['draft', await get(app, id)],
        ['dry-run', await dry(app, id)],
        ['save', await save(app, id)],
      ] as const) {
        expect(res.statusCode, `${label} ${ep}`).toBe(status);
        expect(err(res).code, `${label} ${ep}`).toBe(code);
      }
    }
    expect(totalCalls(mocks)).toBe(0);
    expect(await counts()).toEqual(before);

    // duplicate carries case_id, on all three
    const ok = await accepted();
    const first = EvalCase.parse((await save(app, ok.findingId)).json());
    for (const res of [await get(app, ok.findingId), await dry(app, ok.findingId), await save(app, ok.findingId)]) {
      expect(res.statusCode).toBe(409);
      expect(err(res).code).toBe('duplicate');
      expect(err(res).details?.case_id).toBe(first.id);
    }
    expect(totalCalls(mocks)).toBe(0);
    await app.close();
  });

  it('R-3: input_diff in the body 422 validation_error; other file 422 file_not_in_diff; flipped finding 422 kind_mismatch (AC-9)', async () => {
    const f = await accepted();
    const mocks = hitting();
    const app = await appWith(mocks);
    const draft = EvalCaseDraft.parse((await get(app, f.findingId)).json());
    const base = draft.expected_output;
    const before = await counts();

    for (const call of [dry, save]) {
      let res = await call(app, f.findingId, { input_diff: 'x' });
      expect(res.statusCode).toBe(422);
      expect(err(res).code).toBe('validation_error');

      res = await call(app, f.findingId, { expected_output: { ...base, source: { finding_id: 'x' } } });
      expect(res.statusCode).toBe(422);
      expect(err(res).code).toBe('validation_error');

      res = await call(app, f.findingId, { expected_output: { ...base, start_line: 9, end_line: 3 } });
      expect(res.statusCode).toBe(422);
      expect(err(res).code).toBe('validation_error');

      res = await call(app, f.findingId, { expected_output: { ...base, file: 'src/other.ts' } });
      expect(res.statusCode).toBe(422);
      expect(err(res).code).toBe('file_not_in_diff');
    }
    for (const bad of [{ name: '   ' }, { name: 'n'.repeat(501) }, { owner_id: 'x' }]) {
      const res = await save(app, f.findingId, bad);
      expect(res.statusCode).toBe(422);
      expect(err(res).code).toBe('validation_error');
    }

    // the finding flips after the draft was taken
    await pg.handle.db
      .update(t.findings)
      .set({ acceptedAt: null, dismissedAt: new Date() })
      .where(eq(t.findings.id, f.findingId));
    for (const call of [dry, save]) {
      const res = await call(app, f.findingId, { expected_output: base });
      expect(res.statusCode).toBe(422);
      expect(err(res).code).toBe('kind_mismatch');
    }
    expect(totalCalls(mocks)).toBe(0);
    expect(await counts()).toEqual(before);
    await app.close();
  });

  // ---------------------------------------------------------------- NFR-3, NFR-4, NFR-7

  it('the 11th dry-run in a minute answers 429 and the mock saw 10 calls (NFR-3)', async () => {
    // the limiter is inert under nodeEnv "test" (server INSIGHTS 2026-10-07)
    const f = await accepted();
    const mocks = hitting();
    const app = await appWith(mocks, { NODE_ENV: 'development' });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await dry(app, f.findingId)).statusCode);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(totalCalls(mocks)).toBe(10);
    await app.close();
  });

  it('foreign workspace is 404 on all three; 17 KB bodies are 413; caller text never reaches the model (NFR-4)', async () => {
    const f = await accepted();
    const mocks = hitting();
    const app = await appWith(mocks);
    const draft = EvalCaseDraft.parse((await get(app, f.findingId)).json());

    const foreignAgent = await fx.makeAgent({ ws: fx.foreignWorkspaceId });
    const foreign = await fx.makeFinding({
      ws: fx.foreignWorkspaceId,
      agentId: foreignAgent,
      decided: 'accepted',
    });
    expect((await get(app, foreign.findingId)).statusCode).toBe(404);
    expect((await dry(app, foreign.findingId)).statusCode).toBe(404);
    expect((await save(app, foreign.findingId)).statusCode).toBe(404);

    const big = { name: 'x'.repeat(17 * 1024) };
    expect((await dry(app, f.findingId, { expected_output: { ...draft.expected_output }, pad: big.name })).statusCode).toBe(413);
    expect((await save(app, f.findingId, big)).statusCode).toBe(413);

    const SENTINEL = 'CALLER_SENTINEL_9f3a';
    const r = await dry(app, f.findingId, {
      expected_output: { ...draft.expected_output, title: SENTINEL, severity: SENTINEL, category: SENTINEL },
    });
    expect(r.statusCode).toBe(200);
    expect(totalCalls(mocks)).toBe(1);
    expect(promptOf(allReqs(mocks)[0]!)).not.toContain(SENTINEL);
    await app.close();
  });

  it('one log line per dry-run through the request logger (NFR-7)', async () => {
    const f = await accepted();
    const app = await appWith(hitting(), { LOG_LEVEL: 'warn' });
    // capture req.log.info calls (server INSIGHTS 2026-10-06)
    const infoCalls: unknown[][] = [];
    const realChild = app.log.child.bind(app.log);
    vi.spyOn(app.log, 'child').mockImplementation(((bindings: never, opts: never) => {
      const child = realChild(bindings, opts);
      const info = child.info.bind(child);
      child.info = ((...args: unknown[]) => {
        infoCalls.push(args);
        return (info as (...a: unknown[]) => void)(...args);
      }) as typeof child.info;
      return child;
    }) as typeof app.log.child);

    expect((await dry(app, f.findingId)).statusCode).toBe(200);
    const lines = infoCalls
      .map((a) => a[1])
      .filter((m): m is string => typeof m === 'string' && m.startsWith('eval dry-run finding'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      new RegExp(`^eval dry-run finding ${f.findingId}: passed, cost \\$0\\.0010, \\d+ ms$`),
    );
    await app.close();
  });
});
