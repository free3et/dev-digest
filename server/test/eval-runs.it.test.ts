import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { EvalSuiteRun, EvalSuiteRunDetail, StructuredRequest } from '@devdigest/shared';
import { EvalSuiteRun as EvalSuiteRunSchema, EvalSuiteRunDetail as EvalSuiteRunDetailSchema } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
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
import { buildSingleFileDiff } from '../src/modules/eval/helpers.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', ...extra } as NodeJS.ProcessEnv);

type Behavior = 'hit' | 'miss' | 'drop' | 'offtarget' | 'throw';

const finding = (tag: string, line: number) => ({
  id: `${tag}-${line}`,
  severity: 'CRITICAL',
  category: 'security',
  title: `Finding ${tag} ${line}`,
  file: `src/${tag}.ts`,
  start_line: line,
  end_line: line,
  rationale: 'because',
  confidence: 0.9,
});
const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 50, findings });

/** The case a request belongs to: every case has its own file `src/<tag>.ts`. */
const tagOf = (req: StructuredRequest<unknown>): string => {
  const text = req.messages.map((m) => m.content).join('\n');
  return /diff --git a\/src\/(\w+)\.ts/.exec(text)?.[1] ?? 'unknown';
};

const answer = (tag: string, b: Behavior) => {
  switch (b) {
    case 'hit':
      return review([finding(tag, 11)]);
    case 'miss':
      return review([]);
    case 'drop':
      return review([finding(tag, 11), finding(tag, 900)]);
    case 'offtarget':
      return review([finding(tag, 11)]);
    case 'throw':
      throw new Error('upstream 503');
  }
};

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

d('eval runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'Default'));
    workspaceId = ws?.id ?? (await db.select().from(t.workspaces))[0]!.id;
    const [foreign] = await db.insert(t.workspaces).values({ name: 'Foreign' }).returning();
    foreignWorkspaceId = foreign!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** All three providers mocked (a missing override would be a real paid call). */
  function makeMocks(fn: (req: StructuredRequest<unknown>) => unknown | Promise<unknown>) {
    return {
      openai: new MockLLMProvider('openai', { structuredFn: fn }),
      anthropic: new MockLLMProvider('anthropic', { structuredFn: fn }),
      openrouter: new MockLLMProvider('openrouter', { structuredFn: fn }),
    };
  }
  const scripted = (script: Record<string, Behavior>, fallback: Behavior = 'miss') =>
    makeMocks((req) => {
      const tag = tagOf(req);
      return answer(tag, script[tag] ?? fallback);
    });

  async function appWith(mocks: ReturnType<typeof makeMocks>, extra: Record<string, string> = {}) {
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

  const callsOf = (m: MockLLMProvider) => m.calls.filter((c) => c.method === 'completeStructured');
  const totalCalls = (mocks: ReturnType<typeof makeMocks>) =>
    callsOf(mocks.openai).length + callsOf(mocks.anthropic).length + callsOf(mocks.openrouter).length;

  async function makeAgent(
    o: {
      ws?: string;
      provider?: 'openai' | 'anthropic' | 'openrouter';
      systemPrompt?: string;
      enabled?: boolean;
    } = {},
  ) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: o.ws ?? workspaceId,
        name: `Eval agent ${++seq}`,
        provider: o.provider ?? 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        systemPrompt: o.systemPrompt ?? 'PROMPT_V1',
        enabled: o.enabled ?? true,
        version: 1,
      })
      .returning();
    return a!;
  }

  async function addCase(
    agentId: string,
    tag: string,
    kind: 'must_find' | 'must_not_flag' = 'must_find',
    range: [number, number] = [11, 11],
    ws = workspaceId,
  ) {
    const file = `src/${tag}.ts`;
    const [row] = await pg.handle.db
      .insert(t.evalCases)
      .values({
        workspaceId: ws,
        ownerKind: 'agent',
        ownerId: agentId,
        name: `${file}:${range[0]} ${tag}`,
        inputDiff: buildSingleFileDiff(file, PATCH),
        inputFiles: [file],
        inputMeta: { pr_number: 7, pr_title: `Title of ${tag}`, pr_body: `Body of ${tag}`, repo: 'acme/app' },
        expectedOutput: {
          kind,
          file,
          start_line: range[0],
          end_line: range[1],
          title: 't',
          severity: 'WARNING',
          category: 'bug',
          source: {
            finding_id: randomUUID(),
            review_id: randomUUID(),
            pr_id: randomUUID(),
            repo: 'acme/app',
            head_sha: 'sha',
            agent_id: agentId,
            run_id: null,
          },
        },
      })
      .returning();
    return row!;
  }

  const startRun = (app: App, agentId: string) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const errCode = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;

  async function waitDone(app: App, suiteId: string): Promise<EvalSuiteRunDetail> {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${suiteId}` });
      expect(res.statusCode).toBe(200);
      const body = EvalSuiteRunDetailSchema.parse(res.json());
      if (body.status !== 'running') return body;
      if (Date.now() > deadline) throw new Error(`suite ${suiteId} still running`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  const count = async (table: typeof t.agentRuns | typeof t.runTraces) =>
    (await pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;

  // ------------------------------------------------------------------ AC-9, AC-10, AC-11

  it('starts a suite: 202 shape, skills in prompt order, disabled agent allowed; one call per case; no enrichment (AC-9, 10, 11)', async () => {
    const db = pg.handle.db;
    const agent = await makeAgent({ provider: 'anthropic', enabled: false });
    await db.update(t.agents).set({ version: 3, repoIntel: true }).where(eq(t.agents.id, agent.id));
    const mkSkill = async (name: string, enabled: boolean) =>
      (
        await db
          .insert(t.skills)
          .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: `Body of ${name}`, enabled })
          .returning()
      )[0]!;
    const zeta = await mkSkill(`Zeta rule ${seq}`, true);
    const alpha = await mkSkill(`Alpha rule ${seq}`, true);
    const off = await mkSkill(`Off rule ${seq}`, false);
    await db.insert(t.agentSkills).values([
      { agentId: agent.id, skillId: zeta.id, order: 1, enabled: true },
      { agentId: agent.id, skillId: alpha.id, order: 0, enabled: true },
      { agentId: agent.id, skillId: off.id, order: 2, enabled: true },
    ]);
    // a Project Context doc attached to the agent: must not reach an eval prompt
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `ctx-${seq}`, fullName: `acme/ctx-${seq}` })
      .returning();
    await db.insert(t.agentContextDocs).values({ agentId: agent.id, repoId: repo!.id, path: 'docs/specs.md', order: 0 });

    const c1 = await addCase(agent.id, 'zz9');
    const c2 = await addCase(agent.id, 'aa1', 'must_not_flag');

    const mocks = scripted({ aa1: 'miss', zz9: 'hit' });
    const app = await appWith(mocks);
    const res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(202);
    const started = EvalSuiteRunSchema.parse(res.json());
    expect(started).toMatchObject({
      agent_id: agent.id,
      agent_version: 3,
      status: 'running',
      cases_total: 2,
      finished_at: null,
      skills: [alpha.name, zeta.name],
    });
    // `case_ids` are the agent's cases in name order (src/aa1... before src/zz9...)
    expect(started.case_ids).toEqual([c2.id, c1.id]);

    const done = await waitDone(app, started.id);
    expect(done.status).toBe('done');
    expect(done.cases.map((c) => c.case_id)).toEqual([c2.id, c1.id]);

    // AC-10: exactly one call per case, on the agent's provider, single-shot
    expect(totalCalls(mocks)).toBe(2);
    expect(callsOf(mocks.anthropic)).toHaveLength(2);
    for (const call of callsOf(mocks.anthropic)) {
      const req = call.req as StructuredRequest<unknown>;
      expect(req.maxRetries).toBe(0);
      expect(req.timeoutMs).toBe(120_000);
      expect(req.maxTokens).toBe(8192);
    }
    // repeated reads make no model call
    for (let i = 0; i < 3; i++) await app.inject({ method: 'GET', url: `/eval-runs/${started.id}` });
    await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` });
    expect(totalCalls(mocks)).toBe(2);

    // AC-11: diff, title, body, system prompt and skills are in; no enrichment sections
    const text = (callsOf(mocks.anthropic)[1]!.req as StructuredRequest<unknown>).messages
      .map((m) => m.content)
      .join('\n');
    expect(text).toContain(c1.inputDiff!);
    expect(text).toContain('Title of zz9');
    expect(text).toContain('Body of zz9');
    expect(text).toContain('PROMPT_V1');
    expect(text).toContain('### Alpha rule');
    expect(text).toContain('### Zeta rule');
    expect(text.indexOf('### Alpha rule')).toBeLessThan(text.indexOf('### Zeta rule'));
    expect(text).not.toContain('Off rule');
    for (const heading of [
      '## Repo skeleton',
      '## Callers of changed symbols',
      '## Project context',
      '## Stated intent',
      '## Relevant memory',
    ]) {
      expect(text).not.toContain(heading);
    }
    await app.close();
  });

  // ------------------------------------------------------------------ AC-12, NFR-1, NFR-5, NG-9

  it('scores >= 8 cases of both kinds with a dropped citation and a failing call: partial with exact metrics (AC-12, NFR-1, NFR-5, NG-9)', async () => {
    const agent = await makeAgent();
    const plan: [string, 'must_find' | 'must_not_flag', Behavior, [number, number]?][] = [
      ['a1', 'must_find', 'hit'],
      ['a2', 'must_find', 'hit'],
      ['a3', 'must_find', 'miss'],
      ['a4', 'must_find', 'drop'],
      ['a5', 'must_find', 'throw'],
      ['b1', 'must_not_flag', 'miss'],
      ['b2', 'must_not_flag', 'hit'],
      ['b3', 'must_not_flag', 'miss'],
      ['b4', 'must_not_flag', 'offtarget', [10, 10]],
    ];
    const script: Record<string, Behavior> = {};
    for (const [tag, kind, behavior, range] of plan) {
      await addCase(agent.id, tag, kind, range ?? [11, 11]);
      script[tag] = behavior;
    }
    const mocks = scripted(script);
    const app = await appWith(mocks, { LOG_LEVEL: 'warn' });
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

    const runsBefore = await count(t.agentRuns);
    const tracesBefore = await count(t.runTraces);

    const started = EvalSuiteRunSchema.parse((await startRun(app, agent.id)).json());
    const done = await waitDone(app, started.id);

    expect(done.status).toBe('partial');
    expect(done.cases_total).toBe(9);
    expect(done.cases_completed).toBe(8);
    expect(done.cases_errored).toBe(1);
    expect(done.cases_passed).toBe(6);
    expect(done.recall).toBeCloseTo(3 / 4, 10);
    expect(done.precision).toBeCloseTo(3 / 5, 10);
    expect(done.citation_accuracy).toBeCloseTo(5 / 6, 10);
    expect(done.error).toBeNull();
    expect(done.finished_at).not.toBeNull();
    expect(done.duration_ms).not.toBeNull();

    const byName = (tag: string) => done.cases.find((c) => c.case_name?.includes(`/${tag}.ts`))!;
    expect(byName('a1')).toMatchObject({ outcome: 'passed', pass: true, matched: true, findings_kept: 1, findings_dropped: 0 });
    expect(byName('a3')).toMatchObject({ outcome: 'failed', pass: false, matched: false, findings_kept: 0 });
    expect(byName('a4')).toMatchObject({ outcome: 'passed', findings_kept: 1, findings_dropped: 1 });
    expect(byName('a5')).toMatchObject({
      outcome: 'error',
      pass: null,
      matched: null,
      findings_kept: null,
      cost_usd: null,
      recall: null,
      precision: null,
      citation_accuracy: null,
    });
    expect(byName('a5').error).toContain('upstream 503');
    expect(byName('b1')).toMatchObject({ outcome: 'passed', pass: true, matched: false });
    expect(byName('b2')).toMatchObject({ outcome: 'failed', pass: false, matched: true, expectation_kind: 'must_not_flag' });
    expect(byName('b4')).toMatchObject({ outcome: 'passed', pass: true, matched: false, findings_kept: 1 });

    // NFR-5: a dropped finding keeps its grounding reason
    const dropped = byName('a4').actual_output.dropped;
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.finding.start_line).toBe(900);
    expect(dropped[0]!.reason).toMatch(/do not intersect any diff hunk/);

    // NFR-1: suite cost = sum of non-null per-case costs
    const caseCosts = done.cases.map((c) => c.cost_usd).filter((c): c is number => c !== null);
    expect(caseCosts).toHaveLength(8);
    expect(done.cost_usd).toBeCloseTo(caseCosts.reduce((a, b) => a + b, 0), 10);
    expect(done.cost_usd).toBeCloseTo(0.008, 10);

    // NFR-5: one log line for the finished suite, via req.log
    const line = `eval suite ${started.id}: partial, 6/9 passed, cost $0.0080`;
    expect(infoCalls.filter((a) => a[1] === line)).toHaveLength(1);

    // NG-9: no agent_runs / run_traces written
    expect(await count(t.agentRuns)).toBe(runsBefore);
    expect(await count(t.runTraces)).toBe(tracesBefore);

    // 9 calls, none retried
    expect(totalCalls(mocks)).toBe(9);
    vi.restoreAllMocks();
    await app.close();
  });

  it('every case erroring -> failed, metrics null (AC-12)', async () => {
    const agent = await makeAgent();
    for (const tag of ['c1', 'c2', 'c3']) await addCase(agent.id, tag);
    const mocks = scripted({}, 'throw');
    const app = await appWith(mocks);
    const started = EvalSuiteRunSchema.parse((await startRun(app, agent.id)).json());
    const done = await waitDone(app, started.id);
    expect(done).toMatchObject({
      status: 'failed',
      cases_total: 3,
      cases_completed: 0,
      cases_errored: 3,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
    });
    expect(done.error).toMatch(/all 3 cases errored/);
    expect(totalCalls(mocks)).toBe(3);
    await app.close();
  });

  it('a missing provider key fails the suite with the reason and runs no case (AC-12)', async () => {
    const agent = await makeAgent({ provider: 'openrouter' });
    await addCase(agent.id, 'k1');
    // openrouter is NOT overridden here; the empty secrets store makes it a ConfigError, never a real call
    const openai = new MockLLMProvider('openai', { structured: review([]) });
    const anthropic = new MockLLMProvider('anthropic', { structured: review([]) });
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
    const started = EvalSuiteRunSchema.parse((await startRun(app, agent.id)).json());
    const done = await waitDone(app, started.id);
    expect(done.status).toBe('failed');
    expect(done.error).toContain('OPENROUTER_API_KEY is not configured');
    expect(done.cases).toHaveLength(0);
    expect(openai.calls).toHaveLength(0);
    expect(anthropic.calls).toHaveLength(0);
    await app.close();
  });

  it('prompt v1 vs v2 moves recall by >= 0.2 (AC-12)', async () => {
    const agent = await makeAgent({ systemPrompt: 'PROMPT_V1 find everything' });
    for (const tag of ['m1', 'm2', 'm3', 'm4']) await addCase(agent.id, tag, 'must_find');
    for (const tag of ['n1', 'n2']) await addCase(agent.id, tag, 'must_not_flag');
    // v1 reports the expected line on every case, v2 reports nothing
    const mocks = makeMocks((req) => {
      const tag = tagOf(req);
      const system = req.messages.find((m) => m.role === 'system')!.content;
      const must = tag.startsWith('m');
      if (system.includes('PROMPT_V1')) return review(must ? [finding(tag, 11)] : []);
      return review([]);
    });
    const app = await appWith(mocks);

    const first = EvalSuiteRunSchema.parse((await startRun(app, agent.id)).json());
    const v1 = await waitDone(app, first.id);
    expect(v1.agent_version).toBe(1);

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { system_prompt: 'PROMPT_V2 be terse' },
    });
    expect(put.statusCode).toBe(200);

    const second = EvalSuiteRunSchema.parse((await startRun(app, agent.id)).json());
    const v2 = await waitDone(app, second.id);
    expect(v2.agent_version).toBe(2);

    expect(v1.recall).toBe(1);
    expect(v2.recall).toBe(0);
    expect(Math.abs(v1.recall! - v2.recall!)).toBeGreaterThanOrEqual(0.2);
    expect(totalCalls(mocks)).toBe(12);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-13

  it('answers every R-2 row, with exactly one 202 for concurrent starts and no delete during a run (AC-13)', async () => {
    const gate = deferred();
    const mocks = makeMocks(async (req) => {
      await gate.promise;
      return review([finding(tagOf(req), 11)]);
    });
    const app = await appWith(mocks);
    const suiteCount = async (agentId: string) =>
      (await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agentId))).length;

    // 404: unknown and foreign agent
    const foreignAgent = await makeAgent({ ws: foreignWorkspaceId });
    for (const id of [randomUUID(), foreignAgent.id]) {
      const res = await startRun(app, id);
      expect(res.statusCode).toBe(404);
      expect(errCode(res)).toBe('not_found');
    }

    // 422 no_cases
    const empty = await makeAgent();
    let res = await startRun(app, empty.id);
    expect(res.statusCode).toBe(422);
    expect(errCode(res)).toBe('no_cases');
    expect(await suiteCount(empty.id)).toBe(0);

    // 422 too_many_cases: 101 cases
    const big = await makeAgent();
    await pg.handle.db.insert(t.evalCases).values(
      Array.from({ length: 101 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: big.id,
        name: `bulk ${String(i).padStart(3, '0')}`,
      })),
    );
    res = await startRun(app, big.id);
    expect(res.statusCode).toBe(422);
    expect(errCode(res)).toBe('too_many_cases');
    expect(await suiteCount(big.id)).toBe(0);

    // concurrent starts: exactly one 202, the other 409 eval_run_in_progress
    const agent = await makeAgent();
    const c1 = await addCase(agent.id, 'r1');
    await addCase(agent.id, 'r2');
    const [x, y] = await Promise.all([startRun(app, agent.id), startRun(app, agent.id)]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([202, 409]);
    const refused = x.statusCode === 409 ? x : y;
    expect(errCode(refused)).toBe('eval_run_in_progress');
    const accepted = EvalSuiteRunSchema.parse((x.statusCode === 202 ? x : y).json());
    expect(await suiteCount(agent.id)).toBe(1);

    // a running suite: another start and a case delete are refused, nothing is created or removed
    res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(409);
    expect(errCode(res)).toBe('eval_run_in_progress');
    res = await app.inject({ method: 'DELETE', url: `/eval-cases/${c1.id}` });
    expect(res.statusCode).toBe(409);
    expect(errCode(res)).toBe('eval_run_in_progress');
    expect(await suiteCount(agent.id)).toBe(1);
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, c1.id))).toHaveLength(1);

    // live progress: nothing finished yet
    const mid = EvalSuiteRunDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/eval-runs/${accepted.id}` })).json(),
    );
    expect(mid.status).toBe('running');
    expect(mid.cases_completed + mid.cases_errored).toBeLessThanOrEqual(1);

    gate.release();
    const done = await waitDone(app, accepted.id);
    expect(done.status).toBe('done');
    expect(done.cases_completed + done.cases_errored).toBe(2);

    // once finished the agent can run again
    res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(202);
    await waitDone(app, (res.json() as EvalSuiteRun).id);
    await app.close();
  });

  it('deleting a case does not change the stored aggregates of a finished suite (AC-8)', async () => {
    const agent = await makeAgent();
    const cases = [];
    for (const tag of ['d1', 'd2', 'd3']) cases.push(await addCase(agent.id, tag));
    const mocks = scripted({ d1: 'hit', d2: 'miss', d3: 'hit' });
    const app = await appWith(mocks);
    const started = EvalSuiteRunSchema.parse((await startRun(app, agent.id)).json());
    const before = await waitDone(app, started.id);
    expect(before.cases).toHaveLength(3);

    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${cases[1]!.id}` });
    expect(del.statusCode).toBe(200);

    const after = EvalSuiteRunDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/eval-runs/${started.id}` })).json(),
    );
    const { cases: casesBefore, ...aggBefore } = before;
    const { cases: casesAfter, ...aggAfter } = after;
    expect(aggAfter).toEqual(aggBefore);
    expect(casesBefore).toHaveLength(3);
    expect(casesAfter).toHaveLength(2);
    expect(after.case_ids).toEqual(before.case_ids);
    await app.close();
  });

  // ------------------------------------------------------------------ NFR-3

  it('boot reaps a running suite to failed / interrupted and keeps its case rows (NFR-3)', async () => {
    const db = pg.handle.db;
    const agent = await makeAgent();
    const c1 = await addCase(agent.id, 'z1');
    const c2 = await addCase(agent.id, 'z2');
    const [suite] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        agentVersion: 1,
        caseIds: [c1.id, c2.id],
        casesTotal: 2,
        casesCompleted: 1,
        casesPassed: 1,
      })
      .returning();
    await db.insert(t.evalRuns).values({
      caseId: c1.id,
      suiteRunId: suite!.id,
      pass: true,
      costUsd: 0.002,
      actualOutput: {
        kept: [finding('z1', 11)],
        dropped: [],
        outcome: 'passed',
        expectation_kind: 'must_find',
        matched: true,
        findings_kept: 1,
        findings_dropped: 0,
        error: null,
      },
    });

    const app = await appWith(scripted({}));
    const [row] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, suite!.id));
    expect(row).toMatchObject({ status: 'failed', error: 'interrupted' });
    expect(row!.finishedAt).not.toBeNull();
    expect(row!.casesTotal).toBe(2);
    expect(row!.casesPassed).toBe(1);
    expect(row!.recall).toBe(1);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, suite!.id))).toHaveLength(1);

    const detail = EvalSuiteRunDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/eval-runs/${suite!.id}` })).json(),
    );
    expect(detail.status).toBe('failed');
    expect(detail.cases).toHaveLength(1);
    await app.close();
  });

  // ------------------------------------------------------------------ NFR-4

  it('foreign suite and agent ids answer 404 (NFR-4)', async () => {
    const db = pg.handle.db;
    const foreignAgent = await makeAgent({ ws: foreignWorkspaceId });
    const [foreignSuite] = await db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId: foreignWorkspaceId, agentId: foreignAgent.id, agentVersion: 1, status: 'done' })
      .returning();
    const app = await appWith(scripted({}));
    for (const url of [`/eval-runs/${foreignSuite!.id}`, `/eval-runs/${randomUUID()}`, `/agents/${foreignAgent.id}/eval-runs`]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/eval-runs/not-a-uuid' })).statusCode).toBe(422);
    await app.close();
  });

  it('the 6th run start in a minute answers 429 (NFR-4)', async () => {
    // The limiter is inert under nodeEnv "test" (server INSIGHTS 2026-10-07).
    const agent = await makeAgent();
    const app = await appWith(scripted({}), { NODE_ENV: 'development' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await startRun(app, agent.id)).statusCode);
    expect(statuses.slice(0, 5).every((s) => s === 422)).toBe(true);
    expect(statuses[5]).toBe(429);
    await app.close();
  });
});
