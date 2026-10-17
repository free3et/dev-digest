import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql, and, inArray } from 'drizzle-orm';
import type { StructuredRequest } from '@devdigest/shared';
import {
  EvalDryRunResult,
  EvalSuiteRun as EvalSuiteRunSchema,
  EvalSuiteRunDetail as EvalSuiteRunDetailSchema,
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
} from '../src/adapters/mocks.js';
import { buildSingleFileDiff } from '../src/modules/eval/helpers.js';

/**
 * Spec G1 (skill evals, server): skill suites and skill per-case runs.
 * AC-6 .. AC-13, NFR-1 .. NFR-4. All three providers are mocked in every app,
 * so these tests spend $0.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', ...extra } as NodeJS.ProcessEnv);

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

const textOf = (req: StructuredRequest<unknown>) => req.messages.map((m) => m.content).join('\n');
const tagOf = (req: StructuredRequest<unknown>): string =>
  /diff --git a\/src\/(\w+)\.ts/.exec(textOf(req))?.[1] ?? 'unknown';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

d('skill eval runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let fx: EvalFixtures;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    fx = await evalFixtures(pg);
    workspaceId = fx.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  type Fn = (req: StructuredRequest<unknown>) => unknown | Promise<unknown>;
  /** Every case answers with one finding on line 11 of its own file (a `must_find` hit). */
  const hitFn: Fn = (req) => review([finding(tagOf(req), 11)]);

  function makeMocks(fn: Fn = hitFn) {
    return {
      openai: new MockLLMProvider('openai', { structuredFn: fn }),
      anthropic: new MockLLMProvider('anthropic', { structuredFn: fn }),
      openrouter: new MockLLMProvider('openrouter', { structuredFn: fn }),
    };
  }
  type Mocks = ReturnType<typeof makeMocks>;

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

  const callsOf = (m: MockLLMProvider) => m.calls.filter((c) => c.method === 'completeStructured');
  const allReqs = (m: Mocks) =>
    [m.openai, m.anthropic, m.openrouter].flatMap((p) =>
      callsOf(p).map((c) => c.req as StructuredRequest<unknown>),
    );
  const totalCalls = (m: Mocks) => allReqs(m).length;
  const errCode = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;

  async function addCase(
    owner: { kind: 'agent' | 'skill'; id: string },
    tag: string,
    ws = workspaceId,
    kind: 'must_find' | 'must_not_flag' = 'must_find',
  ) {
    const file = `src/${tag}.ts`;
    const [row] = await pg.handle.db
      .insert(t.evalCases)
      .values({
        workspaceId: ws,
        ownerKind: owner.kind,
        ownerId: owner.id,
        name: `${file}:11 ${tag}`,
        inputDiff: buildSingleFileDiff(file, PATCH),
        inputFiles: [file],
        inputMeta: { pr_number: 7, pr_title: `Title of ${tag}`, pr_body: `Body of ${tag}`, repo: 'acme/app' },
        expectedOutput: {
          kind,
          file,
          start_line: 11,
          end_line: 11,
          title: 't',
          severity: 'WARNING',
          category: 'bug',
          source: null,
        },
      })
      .returning();
    return row!;
  }

  const startSkillRun = (app: App, skillId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/skills/${skillId}/eval-runs`, payload: payload as object });
  const startAgentRun = (app: App, agentId: string) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const runCaseReq = (app: App, caseId: string, payload?: unknown) =>
    app.inject({ method: 'POST', url: `/eval-cases/${caseId}/run`, ...(payload ? { payload: payload as object } : {}) });

  async function waitDone(app: App, suiteId: string) {
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

  const rowCount = async (table: typeof t.evalRuns | typeof t.evalSuiteRuns | typeof t.agentRuns | typeof t.runTraces) =>
    (await pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;
  const suiteCount = async (skillId: string) =>
    (
      await pg.handle.db
        .select({ n: sql<number>`count(*)::int` })
        .from(t.evalSuiteRuns)
        .where(eq(t.evalSuiteRuns.skillId, skillId))
    )[0]!.n;

  /** Captures the `req.log.info` calls (server INSIGHTS 2026-10-06). */
  function captureInfo(app: App) {
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
    return infoCalls;
  }

  /** A host agent on `provider` with a known version. */
  async function host(version = 1, provider: 'openai' | 'anthropic' | 'openrouter' = 'anthropic') {
    const id = await fx.makeAgent({ provider, systemPrompt: 'HOST_PROMPT' });
    await pg.handle.db.update(t.agents).set({ version }).where(eq(t.agents.id, id));
    return id;
  }

  // ------------------------------------------------------------------ AC-6

  it('runs one skill case through a host: one call, versions, nothing stored (AC-6)', async () => {
    const skill = await fx.makeSkill({ version: 4 });
    const hostId = await host(3);
    const kase = await addCase({ kind: 'skill', id: skill.id }, 'sk1');
    const mocks = makeMocks();
    const app = await appWith(mocks);

    const before = [
      await rowCount(t.evalRuns),
      await rowCount(t.evalSuiteRuns),
      await rowCount(t.agentRuns),
      await rowCount(t.runTraces),
    ];
    const res = await runCaseReq(app, kase.id, { agent_id: hostId });
    expect(res.statusCode).toBe(200);
    const body = EvalDryRunResult.parse(res.json());
    expect(body).toMatchObject({ outcome: 'passed', agent_version: 3, skill_version: 4 });
    expect(totalCalls(mocks)).toBe(1);
    expect(callsOf(mocks.anthropic)).toHaveLength(1); // the host's provider
    expect(
      [await rowCount(t.evalRuns), await rowCount(t.evalSuiteRuns), await rowCount(t.agentRuns), await rowCount(t.runTraces)],
    ).toEqual(before);

    // an agent-owned case without agent_id still runs its own agent, skill_version null
    const agentId = await host(2, 'openai');
    const agentCase = await addCase({ kind: 'agent', id: agentId }, 'ag1');
    const res2 = await runCaseReq(app, agentCase.id);
    expect(res2.statusCode).toBe(200);
    expect(EvalDryRunResult.parse(res2.json())).toMatchObject({ agent_version: 2, skill_version: null });
    expect(callsOf(mocks.openai)).toHaveLength(1);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-7

  it('refuses each R-G2 run row before any model call (AC-7)', async () => {
    const skill = await fx.makeSkill();
    const hostId = await host();
    const skillCase = await addCase({ kind: 'skill', id: skill.id }, 'r1');
    const agentCase = await addCase({ kind: 'agent', id: hostId }, 'r2');
    const mocks = makeMocks();
    const app = await appWith(mocks);

    // case unknown
    expect((await runCaseReq(app, randomUUID(), { agent_id: hostId })).statusCode).toBe(404);
    // skill case without host
    let r = await runCaseReq(app, skillCase.id);
    expect([r.statusCode, errCode(r)]).toEqual([422, 'host_required']);
    r = await runCaseReq(app, skillCase.id, {});
    expect([r.statusCode, errCode(r)]).toEqual([422, 'host_required']);
    // host unknown / foreign
    const foreignAgent = await fx.makeAgent({ ws: fx.foreignWorkspaceId });
    for (const id of [foreignAgent, randomUUID()]) {
      r = await runCaseReq(app, skillCase.id, { agent_id: id });
      expect([r.statusCode, errCode(r)]).toEqual([422, 'host_not_found']);
    }
    // malformed host id
    expect((await runCaseReq(app, skillCase.id, { agent_id: 'nope' })).statusCode).toBe(422);
    // agent case with agent_id
    r = await runCaseReq(app, agentCase.id, { agent_id: hostId });
    expect([r.statusCode, errCode(r)]).toEqual([422, 'host_not_allowed']);
    // the case's skill no longer exists
    const ghostSkill = randomUUID();
    const ghostCase = await addCase({ kind: 'skill', id: ghostSkill }, 'r3');
    r = await runCaseReq(app, ghostCase.id, { agent_id: hostId });
    expect([r.statusCode, errCode(r)]).toEqual([404, 'not_found']);
    // expected_output.file outside the frozen diff
    r = await runCaseReq(app, skillCase.id, {
      agent_id: hostId,
      expected_output: { kind: 'must_find', file: 'src/other.ts', start_line: 1, end_line: 1, title: 't', severity: 'x', category: 'y' },
    });
    expect([r.statusCode, errCode(r)]).toEqual([422, 'file_not_in_diff']);

    expect(totalCalls(mocks)).toBe(0);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-8

  it('puts ONLY the skill under test in the prompt, for a suite case and a per-case run (AC-8)', async () => {
    const skill = await fx.makeSkill({ name: `Rubric ${++seq}`, body: 'RUBRIC_BODY_TEXT', source: 'community' });
    const hostId = await host();
    const other1 = await fx.makeSkill({ name: `Other one ${seq}`, body: 'OTHER_ONE_BODY' });
    const other2 = await fx.makeSkill({ name: `Other two ${seq}`, body: 'OTHER_TWO_BODY' });
    await fx.linkSkill(hostId, other1.id, { order: 0 });
    await fx.linkSkill(hostId, other2.id, { order: 1 });
    await fx.linkSkill(hostId, skill.id, { order: 2 });
    // a Project Context doc on the host must not reach the prompt either
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `ctx-${seq}`, fullName: `acme/ctx-${seq}` })
      .returning();
    await pg.handle.db.insert(t.agentContextDocs).values({ agentId: hostId, repoId: repo!.id, path: 'docs/x.md', order: 0 });

    const kase = await addCase({ kind: 'skill', id: skill.id }, 'pm1');
    const mocks = makeMocks();
    const app = await appWith(mocks);

    const check = (req: StructuredRequest<unknown>) => {
      const text = textOf(req);
      expect(text.split(`### ${skill.name}`).length - 1).toBe(1);
      expect(text).toContain('RUBRIC_BODY_TEXT');
      expect(text).toContain('> Third-party skill');
      expect(text).toContain('HOST_PROMPT');
      expect(text).toContain(kase.inputDiff!);
      expect(text).toContain('Title of pm1');
      expect(text).toContain('Body of pm1');
      expect(text).not.toContain('OTHER_ONE_BODY');
      expect(text).not.toContain('OTHER_TWO_BODY');
      expect(text).not.toContain(other1.name);
      for (const heading of [
        '## Repo skeleton',
        '## Callers of changed symbols',
        '## Project context',
        '## Stated intent',
        '## Relevant memory',
      ]) {
        expect(text).not.toContain(heading);
      }
    };

    const started = EvalSuiteRunSchema.parse((await startSkillRun(app, skill.id, { agent_id: hostId })).json());
    const done = await waitDone(app, started.id);
    expect(done.status).toBe('done');
    expect(allReqs(mocks)).toHaveLength(1);
    check(allReqs(mocks)[0]!);

    expect((await runCaseReq(app, kase.id, { agent_id: hostId })).statusCode).toBe(200);
    expect(allReqs(mocks)).toHaveLength(2);
    check(allReqs(mocks)[1]!);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-9

  it('starts a skill suite: 202 fields; disabled skill, disabled host and unlinked host still run; skill_version bumps (AC-9)', async () => {
    const skill = await fx.makeSkill({ enabled: false, version: 2, name: `Disabled rubric ${++seq}` });
    const hostId = await host(5);
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, hostId));
    const c1 = await addCase({ kind: 'skill', id: skill.id }, 'zz9');
    const c2 = await addCase({ kind: 'skill', id: skill.id }, 'aa1');
    const mocks = makeMocks();
    const app = await appWith(mocks);

    const res = await startSkillRun(app, skill.id, { agent_id: hostId });
    expect(res.statusCode).toBe(202);
    const started = EvalSuiteRunSchema.parse(res.json());
    expect(started).toMatchObject({
      owner_kind: 'skill',
      skill_id: skill.id,
      skill_version: 2,
      agent_id: hostId,
      agent_version: 5,
      status: 'running',
      cases_total: 2,
      skills: [skill.name],
    });
    expect(started.case_ids).toEqual([c2.id, c1.id]); // name order
    const done = await waitDone(app, started.id);
    expect(done).toMatchObject({ owner_kind: 'skill', skill_id: skill.id, skill_version: 2 });

    // edit the body: version +1 on the next suite
    const put = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'A new body' } });
    expect(put.statusCode).toBe(200);
    const second = EvalSuiteRunSchema.parse((await startSkillRun(app, skill.id, { agent_id: hostId })).json());
    expect(second.skill_version).toBe(3);
    await waitDone(app, second.id);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-10

  it('refuses each R-G3 row with its status and code and creates no suite (AC-10)', async () => {
    const gate = deferred();
    const mocks = makeMocks(async (req) => {
      await gate.promise;
      return hitFn(req);
    });
    const app = await appWith(mocks);
    const hostId = await host();

    // skill unknown / foreign
    const foreignSkill = await fx.makeSkill({ ws: fx.foreignWorkspaceId });
    for (const id of [foreignSkill.id, randomUUID()]) {
      const r = await startSkillRun(app, id, { agent_id: hostId });
      expect([r.statusCode, errCode(r)]).toEqual([404, 'not_found']);
    }

    const skill = await fx.makeSkill();
    // body shape
    for (const body of [{}, { agent_id: hostId, extra: 1 }, { agent_id: 'nope' }]) {
      const r = await startSkillRun(app, skill.id, body);
      expect([r.statusCode, errCode(r)]).toEqual([422, 'validation_error']);
    }
    // host unknown / foreign
    const foreignAgent = await fx.makeAgent({ ws: fx.foreignWorkspaceId });
    for (const id of [foreignAgent, randomUUID()]) {
      const r = await startSkillRun(app, skill.id, { agent_id: id });
      expect([r.statusCode, errCode(r)]).toEqual([422, 'host_not_found']);
    }
    // no cases
    let r = await startSkillRun(app, skill.id, { agent_id: hostId });
    expect([r.statusCode, errCode(r)]).toEqual([422, 'no_cases']);

    // more than 100
    const big = await fx.makeSkill();
    await pg.handle.db.insert(t.evalCases).values(
      Array.from({ length: 101 }, (_, i) => ({
        workspaceId,
        ownerKind: 'skill' as const,
        ownerId: big.id,
        name: `bulk ${i}`,
        inputDiff: buildSingleFileDiff('src/bulk.ts', PATCH),
        inputFiles: ['src/bulk.ts'],
        inputMeta: { pr_number: 0, pr_title: 'x', pr_body: null, repo: 'manual' },
        expectedOutput: { kind: 'must_find', file: 'src/bulk.ts', start_line: 11, end_line: 11, title: 't', severity: 'x', category: 'y', source: null },
      })),
    );
    r = await startSkillRun(app, big.id, { agent_id: hostId });
    expect([r.statusCode, errCode(r)]).toEqual([422, 'too_many_cases']);
    expect(await suiteCount(big.id)).toBe(0);
    expect(await suiteCount(skill.id)).toBe(0);

    // two concurrent starts -> one 202, one 409 (the mock holds the first run open)
    await addCase({ kind: 'skill', id: skill.id }, 'cc1');
    const [a, b] = await Promise.all([
      startSkillRun(app, skill.id, { agent_id: hostId }),
      startSkillRun(app, skill.id, { agent_id: hostId }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect(errCode(loser)).toBe('eval_run_in_progress');
    expect(await suiteCount(skill.id)).toBe(1);
    // a third start while it still runs
    r = await startSkillRun(app, skill.id, { agent_id: hostId });
    expect(r.statusCode).toBe(409);
    const winner = EvalSuiteRunSchema.parse((a.statusCode === 202 ? a : b).json());
    gate.release();
    await waitDone(app, winner.id);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-11

  it('a skill suite and its host agent suite run at the same time, in both orders (AC-11)', async () => {
    const gate = deferred();
    const mocks = makeMocks(async (req) => {
      await gate.promise;
      return hitFn(req);
    });
    const app = await appWith(mocks);
    const hostId = await host();
    await addCase({ kind: 'agent', id: hostId }, 'ag11');
    const skill1 = await fx.makeSkill();
    const skill2 = await fx.makeSkill();
    await addCase({ kind: 'skill', id: skill1.id }, 'sk11');
    await addCase({ kind: 'skill', id: skill2.id }, 'sk12');

    // skill suite first, then the host's agent suite
    const s1 = await startSkillRun(app, skill1.id, { agent_id: hostId });
    expect(s1.statusCode).toBe(202);
    const a1 = await startAgentRun(app, hostId);
    expect(a1.statusCode).toBe(202);
    const running = await pg.handle.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.agentId, hostId), eq(t.evalSuiteRuns.status, 'running')));
    expect(running.map((r) => r.ownerKind).sort()).toEqual(['agent', 'skill']);
    gate.release();
    await waitDone(app, (s1.json() as { id: string }).id);
    await waitDone(app, (a1.json() as { id: string }).id);

    // agent suite first, then a skill suite hosted by the same agent
    const gate2 = deferred();
    const mocks2 = makeMocks(async (req) => {
      await gate2.promise;
      return hitFn(req);
    });
    const app2 = await appWith(mocks2);
    const a2 = await startAgentRun(app2, hostId);
    expect(a2.statusCode).toBe(202);
    const s2 = await startSkillRun(app2, skill2.id, { agent_id: hostId });
    expect(s2.statusCode).toBe(202);
    gate2.release();
    await waitDone(app2, (a2.json() as { id: string }).id);
    await waitDone(app2, (s2.json() as { id: string }).id);
    await app.close();
    await app2.close();
  });

  // ------------------------------------------------------------------ AC-12

  it('keeps skill suites out of agent history, the dashboard and recent runs (AC-12)', async () => {
    const db = pg.handle.db;
    const hostId = await host();
    const skill = await fx.makeSkill();
    await addCase({ kind: 'agent', id: hostId }, 'h12');
    const base = {
      workspaceId,
      agentId: hostId,
      agentVersion: 1,
      status: 'done' as const,
      casesTotal: 1,
      casesCompleted: 1,
      casesPassed: 1,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
    };
    const [agentSuite] = await db
      .insert(t.evalSuiteRuns)
      .values({ ...base, ranAt: new Date('2026-01-01T10:00:00Z') })
      .returning();
    const [skillOld] = await db
      .insert(t.evalSuiteRuns)
      .values({ ...base, ownerKind: 'skill', skillId: skill.id, skillVersion: 1, ranAt: new Date('2026-01-02T10:00:00Z') })
      .returning();
    const [skillNew] = await db
      .insert(t.evalSuiteRuns)
      .values({ ...base, ownerKind: 'skill', skillId: skill.id, skillVersion: 2, ranAt: new Date('2026-01-03T10:00:00Z') })
      .returning();
    // another skill's suite, and a RUNNING skill suite hosted by the agent
    const otherSkill = await fx.makeSkill();
    await db.insert(t.evalSuiteRuns).values({ ...base, ownerKind: 'skill', skillId: otherSkill.id, skillVersion: 1 });
    const [runningSkill] = await db
      .insert(t.evalSuiteRuns)
      .values({ ...base, ownerKind: 'skill', skillId: skill.id, skillVersion: 3, status: 'running' })
      .returning();
    // 51st+ suites for the cap
    const app = await appWith(makeMocks());

    const hist = (await app.inject({ method: 'GET', url: `/agents/${hostId}/eval-runs` })).json() as { id: string }[];
    expect(hist.map((r) => r.id)).toEqual([agentSuite!.id]);

    const dash = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json() as {
      agent_id: string;
      latest: { id: string } | null;
      running: boolean;
    }[];
    const row = dash.find((r) => r.agent_id === hostId)!;
    expect(row.latest!.id).toBe(agentSuite!.id);
    expect(row.running).toBe(false);

    const recent = (await app.inject({ method: 'GET', url: '/eval/recent-runs?limit=50' })).json() as { id: string }[];
    const ids = recent.map((r) => r.id);
    expect(ids).toContain(agentSuite!.id);
    for (const s of [skillOld, skillNew]) expect(ids).not.toContain(s!.id);

    const skillList = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs` })).json() as { id: string; owner_kind: string; skill_id: string }[];
    expect(skillList.every((r) => r.owner_kind === 'skill' && r.skill_id === skill.id)).toBe(true);
    expect(skillList).toHaveLength(3);
    // newest first by ran_at: the running row was inserted last (now()), then new, then old
    expect(skillList.map((r) => r.id)).toEqual([runningSkill!.id, skillNew!.id, skillOld!.id]);

    // the detail answers for a skill suite
    const detail = await app.inject({ method: 'GET', url: `/eval-runs/${skillNew!.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ owner_kind: 'skill', skill_id: skill.id, skill_version: 2 });

    // cap at 50
    const capSkill = await fx.makeSkill();
    await db.insert(t.evalSuiteRuns).values(
      Array.from({ length: 55 }, (_, i) => ({
        ...base,
        ownerKind: 'skill' as const,
        skillId: capSkill.id,
        skillVersion: 1,
        ranAt: new Date(2026, 1, 1, 0, i),
      })),
    );
    expect(((await app.inject({ method: 'GET', url: `/skills/${capSkill.id}/eval-runs` })).json() as unknown[]).length).toBe(50);

    // foreign / unknown skill
    const foreignSkill = await fx.makeSkill({ ws: fx.foreignWorkspaceId });
    for (const id of [foreignSkill.id, randomUUID()]) {
      expect((await app.inject({ method: 'GET', url: `/skills/${id}/eval-runs` })).statusCode).toBe(404);
    }

    await db.update(t.evalSuiteRuns).set({ status: 'failed' }).where(eq(t.evalSuiteRuns.id, runningSkill!.id));
    await app.close();
  });

  // ------------------------------------------------------------------ AC-13

  it('reads a suite stored without the new columns as an agent suite (AC-13)', async () => {
    const hostId = await host();
    // raw SQL that omits owner_kind / skill_id / skill_version, as a pre-0016 row
    const rows = await pg.handle.db.execute(sql`
      insert into eval_suite_runs (workspace_id, agent_id, agent_version, status, case_ids, skills, cases_total)
      values (${workspaceId}, ${hostId}, 2, 'done', '[]'::jsonb, '[]'::jsonb, 0)
      returning id`);
    const id = (rows as unknown as { id: string }[])[0]!.id;
    const app = await appWith(makeMocks());
    const detail = await app.inject({ method: 'GET', url: `/eval-runs/${id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id, owner_kind: 'agent', skill_id: null, skill_version: null, agent_id: hostId, agent_version: 2 });
    const list = (await app.inject({ method: 'GET', url: `/agents/${hostId}/eval-runs` })).json() as Record<string, unknown>[];
    expect(list.find((r) => r.id === id)).toMatchObject({ owner_kind: 'agent', skill_id: null, skill_version: null });
    await app.close();
  });

  // ------------------------------------------------------------------ NFR-1, NFR-4

  it('one call per case with maxRetries 0, costs stored, and the NFR-4 log lines (NFR-1, NFR-4)', async () => {
    const skill = await fx.makeSkill();
    const hostId = await host();
    const cases = [];
    for (const tag of ['n1', 'n2', 'n3']) cases.push(await addCase({ kind: 'skill', id: skill.id }, tag));
    const mocks = makeMocks();
    const app = await appWith(mocks, { LOG_LEVEL: 'warn' });
    const infoCalls = captureInfo(app);

    const started = EvalSuiteRunSchema.parse((await startSkillRun(app, skill.id, { agent_id: hostId })).json());
    const done = await waitDone(app, started.id);
    expect(done.status).toBe('done');
    expect(totalCalls(mocks)).toBe(done.cases_total);
    for (const req of allReqs(mocks)) {
      expect(req.maxRetries).toBe(0);
      expect(req.timeoutMs).toBe(120_000);
      expect(req.maxTokens).toBe(8192);
    }
    expect(done.cases.every((c) => c.cost_usd !== null)).toBe(true);
    expect(done.cost_usd).toBeCloseTo(0.003, 10);
    // no agent_runs / run_traces for the host
    expect(
      await pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(t.agentRuns).where(eq(t.agentRuns.agentId, hostId)),
    ).toEqual([{ n: 0 }]);

    // suite line
    const line = `eval suite ${started.id} (skill ${skill.id}): done, 3/3 passed, cost $0.0030`;
    const suiteLines = infoCalls.filter((a) => a[1] === line);
    expect(suiteLines).toHaveLength(1);
    expect(suiteLines[0]![0]).toMatchObject({ suite_run_id: started.id, skill_id: skill.id, agent_id: hostId });

    // per-case line
    infoCalls.length = 0;
    const res = await runCaseReq(app, cases[0]!.id, { agent_id: hostId });
    expect(res.statusCode).toBe(200);
    const caseLines = infoCalls.filter(
      (a) => typeof a[1] === 'string' && (a[1] as string).startsWith('eval case '),
    );
    expect(caseLines).toHaveLength(1);
    expect(caseLines[0]![0]).toMatchObject({
      case_id: cases[0]!.id,
      skill_id: skill.id,
      agent_id: hostId,
      outcome: 'passed',
      cost_usd: 0.001,
    });
    expect(caseLines[0]![1]).toBe(`eval case ${cases[0]!.id} (skill ${skill.id}): single run passed, cost $0.0010`);
    vi.restoreAllMocks();
    await app.close();
  });

  // ------------------------------------------------------------------ NFR-2

  it('boot reaps a running skill suite to failed / interrupted and keeps its case rows (NFR-2)', async () => {
    const db = pg.handle.db;
    const skill = await fx.makeSkill();
    const hostId = await host();
    const c1 = await addCase({ kind: 'skill', id: skill.id }, 'rp1');
    const c2 = await addCase({ kind: 'skill', id: skill.id }, 'rp2');
    const [suite] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        ownerKind: 'skill',
        skillId: skill.id,
        skillVersion: 1,
        agentId: hostId,
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
        kept: [finding('rp1', 11)],
        dropped: [],
        outcome: 'passed',
        expectation_kind: 'must_find',
        matched: true,
        findings_kept: 1,
        findings_dropped: 0,
        error: null,
      },
    });
    const app = await appWith(makeMocks());
    const [row] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, suite!.id));
    expect(row).toMatchObject({ status: 'failed', error: 'interrupted', ownerKind: 'skill', casesTotal: 2, casesPassed: 1 });
    expect(await db.select().from(t.evalRuns).where(inArray(t.evalRuns.caseId, [c1.id, c2.id]))).toHaveLength(1);
    await app.close();
  });

  // ------------------------------------------------------------------ NFR-3

  it('the 6th skill suite start in a minute answers 429 (NFR-3)', async () => {
    // The limiter is inert under nodeEnv "test" (server INSIGHTS 2026-10-07).
    const skill = await fx.makeSkill(); // no cases: every start is a cheap 422
    const hostId = await host();
    const app = await appWith(makeMocks(), { NODE_ENV: 'development' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await startSkillRun(app, skill.id, { agent_id: hostId })).statusCode);
    expect(statuses.slice(0, 5).every((s) => s === 422)).toBe(true);
    expect(statuses[5]).toBe(429);
    await app.close();
  });
});
