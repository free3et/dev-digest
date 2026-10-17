import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { EvalCase } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', ...extra } as NodeJS.ProcessEnv);

d('eval cases (Testcontainers pg)', () => {
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

  /** All three providers mocked: a missing override would be a real paid call. */
  function appWith(nodeEnv?: string) {
    const mocks = (['openai', 'anthropic', 'openrouter'] as const).map((id) => new MockLLMProvider(id));
    return buildApp({
      config: config(nodeEnv ? { NODE_ENV: nodeEnv } : {}),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({}),
        github: new MockGitHubClient(),
        llm: { openai: mocks[0]!, anthropic: mocks[1]!, openrouter: mocks[2]! },
      },
    });
  }

  async function makeAgent(ws = workspaceId, name = `Agent ${++seq}`) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'review' })
      .returning();
    return a!.id;
  }

  interface FixtureOpts {
    ws?: string;
    /** undefined = no agent on the review. */
    agentId?: string | null;
    decided?: 'accepted' | 'dismissed' | null;
    /** null = no pr_files row. */
    patch?: string | null;
    file?: string;
    start?: number;
    end?: number;
    title?: string;
  }

  async function makeFinding(o: FixtureOpts = {}) {
    const db = pg.handle.db;
    const ws = o.ws ?? workspaceId;
    const file = o.file ?? 'src/config.ts';
    const name = `evalrepo-${++seq}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 500 + seq,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'feat',
        base: 'main',
        headSha: 'sha-1',
        body: 'PR body text',
      })
      .returning();
    if (o.patch !== null) {
      await db.insert(t.prFiles).values({ prId: pr!.id, path: file, patch: o.patch ?? PATCH });
    }
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId: o.agentId ?? null, kind: 'review' })
      .returning();
    const [finding] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file,
        startLine: o.start ?? 11,
        endLine: o.end ?? 12,
        severity: 'CRITICAL',
        category: 'security',
        title: o.title ?? 'Hard-coded Stripe key',
        rationale: 'because',
        confidence: 0.9,
        acceptedAt: o.decided === 'accepted' ? new Date() : null,
        dismissedAt: o.decided === 'dismissed' ? new Date() : null,
      })
      .returning();
    return { findingId: finding!.id, reviewId: review!.id, prId: pr!.id, repoName: name };
  }

  const casesCount = async () => (await pg.handle.db.select().from(t.evalCases)).length;

  it('accepted finding -> 201 must_find with frozen input (AC-1)', async () => {
    const agentId = await makeAgent();
    const f = await makeFinding({ agentId, decided: 'accepted' });
    const app = await appWith();
    const res = await app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` });
    expect(res.statusCode).toBe(201);
    const body = EvalCase.parse(res.json());
    expect(body.owner_kind).toBe('agent');
    expect(body.owner_id).toBe(agentId);
    expect(body.expected_output).toMatchObject({
      kind: 'must_find',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 12,
      source: { finding_id: f.findingId, review_id: f.reviewId, pr_id: f.prId, agent_id: agentId, run_id: null },
    });
    expect(body.name).toBe('src/config.ts:11 Hard-coded Stripe key');
    expect(body.input_files).toEqual(['src/config.ts']);
    expect(body.input_diff).toContain('--- a/src/config.ts');
    expect(body.input_diff).toContain(PATCH);
    expect(body.input_meta).toMatchObject({ pr_title: 'Add rate limiting', pr_body: 'PR body text' });
    expect(body.input_meta.repo).toBe(`acme/${f.repoName}`);

    const [row] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, body.id));
    expect(row).toMatchObject({ workspaceId, ownerKind: 'agent', ownerId: agentId, name: body.name });
    await app.close();
  });

  it('dismissed finding -> 201 must_not_flag (AC-2)', async () => {
    const agentId = await makeAgent();
    const f = await makeFinding({ agentId, decided: 'dismissed', start: 20, end: 20 });
    const app = await appWith();
    const res = await app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` });
    expect(res.statusCode).toBe(201);
    const body = EvalCase.parse(res.json());
    expect(body.expected_output).toMatchObject({ kind: 'must_not_flag', start_line: 20, end_line: 20 });
    await app.close();
  });

  it('the case is frozen after a flip, review delete and PR delete (AC-3)', async () => {
    const agentId = await makeAgent();
    const f = await makeFinding({ agentId, decided: 'accepted' });
    const app = await appWith();
    const created = await app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` });
    expect(created.statusCode).toBe(201);
    const before = EvalCase.parse(created.json());
    const db = pg.handle.db;

    await db
      .update(t.findings)
      .set({ acceptedAt: null, dismissedAt: new Date() })
      .where(eq(t.findings.id, f.findingId));
    await db.delete(t.reviews).where(eq(t.reviews.id, f.reviewId));
    await db.delete(t.pullRequests).where(eq(t.pullRequests.id, f.prId));

    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });
    expect(list.statusCode).toBe(200);
    const after = (list.json() as EvalCase[]).find((c) => c.id === before.id)!;
    expect(after.input_diff).toBe(before.input_diff);
    expect(after.input_files).toEqual(before.input_files);
    expect(after.input_meta).toEqual(before.input_meta);
    expect(after.expected_output).toEqual(before.expected_output);
    await app.close();
  });

  it('every R-1 refusal stores no case (AC-4)', async () => {
    const agentId = await makeAgent();
    const app = await appWith();
    const post = (id: string) => app.inject({ method: 'POST', url: `/findings/${id}/eval-case` });
    const err = (res: { json(): unknown }) =>
      (res.json() as { error: { code: string; details?: { case_id?: string } } }).error;
    const baseline = await casesCount();

    // not_found: unknown id and a finding of another workspace
    const foreignAgent = await makeAgent(foreignWorkspaceId);
    const foreign = await makeFinding({ ws: foreignWorkspaceId, agentId: foreignAgent, decided: 'accepted' });
    for (const id of [randomUUID(), foreign.findingId]) {
      const res = await post(id);
      expect(res.statusCode).toBe(404);
      expect(err(res).code).toBe('not_found');
    }

    // finding_undecided wins over no_agent and patch_unavailable (R-1 order)
    const undecided = await makeFinding({ agentId: null, decided: null, patch: null });
    let res = await post(undecided.findingId);
    expect(res.statusCode).toBe(409);
    expect(err(res).code).toBe('finding_undecided');

    // no_agent: review without agent, and an agent that no longer exists
    const noAgent = await makeFinding({ agentId: null, decided: 'accepted', patch: null });
    res = await post(noAgent.findingId);
    expect(res.statusCode).toBe(409);
    expect(err(res).code).toBe('no_agent');
    const gone = await makeAgent();
    const orphan = await makeFinding({ agentId: gone, decided: 'accepted' });
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, gone));
    res = await post(orphan.findingId);
    expect(res.statusCode).toBe(409);
    expect(err(res).code).toBe('no_agent');

    // patch_unavailable: no pr_files row, and a row with a null patch
    const noPatch = await makeFinding({ agentId, decided: 'accepted', patch: null });
    res = await post(noPatch.findingId);
    expect(res.statusCode).toBe(409);
    expect(err(res).code).toBe('patch_unavailable');
    const nullPatch = await makeFinding({ agentId, decided: 'accepted' });
    await pg.handle.db.update(t.prFiles).set({ patch: null }).where(eq(t.prFiles.prId, nullPatch.prId));
    res = await post(nullPatch.findingId);
    expect(err(res).code).toBe('patch_unavailable');

    expect(await casesCount()).toBe(baseline);

    // duplicate: carries the existing case id, and wins over patch_unavailable
    const ok = await makeFinding({ agentId, decided: 'accepted' });
    const first = await post(ok.findingId);
    expect(first.statusCode).toBe(201);
    await pg.handle.db.delete(t.prFiles).where(eq(t.prFiles.prId, ok.prId));
    res = await post(ok.findingId);
    expect(res.statusCode).toBe(409);
    expect(err(res).code).toBe('duplicate');
    expect(err(res).details?.case_id).toBe((first.json() as EvalCase).id);
    expect(await casesCount()).toBe(baseline + 1);

    // a malformed id is a 422 before the handler
    expect((await post('not-a-uuid')).statusCode).toBe(422);
    await app.close();
  });

  it('two concurrent creates for one finding: one 201, one 409 duplicate with case_id (AC-4)', async () => {
    const agentId = await makeAgent();
    const f = await makeFinding({ agentId, decided: 'accepted' });
    const app = await appWith();
    const baseline = await casesCount();
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` }),
      app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    const created = (a.statusCode === 201 ? a : b).json() as EvalCase;
    const refused = (a.statusCode === 409 ? a : b).json() as {
      error: { code: string; details: { case_id: string } };
    };
    expect(refused.error.code).toBe('duplicate');
    expect(refused.error.details.case_id).toBe(created.id);
    expect(await casesCount()).toBe(baseline + 1);
    await app.close();
  });

  it('lists only the agent cases sorted by name; foreign / unknown agent -> 404 (AC-7, NFR-4)', async () => {
    const agentId = await makeAgent();
    const other = await makeAgent();
    const app = await appWith();
    for (const [agent, file] of [
      [agentId, 'src/zeta.ts'],
      [agentId, 'src/alpha.ts'],
      [agentId, 'src/mid.ts'],
      [other, 'src/other.ts'],
    ] as const) {
      const f = await makeFinding({ agentId: agent, decided: 'accepted', file });
      expect((await app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` })).statusCode).toBe(201);
    }
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });
    expect(res.statusCode).toBe(200);
    const cases = res.json() as EvalCase[];
    expect(cases.map((c) => c.expected_output.file)).toEqual(['src/alpha.ts', 'src/mid.ts', 'src/zeta.ts']);
    expect(cases.every((c) => c.owner_id === agentId)).toBe(true);

    const foreignAgent = await makeAgent(foreignWorkspaceId);
    for (const id of [foreignAgent, randomUUID()]) {
      expect((await app.inject({ method: 'GET', url: `/agents/${id}/eval-cases` })).statusCode).toBe(404);
    }
    await app.close();
  });

  it('DELETE removes the case; unknown / foreign -> 404; running suite -> 409 (A-AC-13 delete)', async () => {
    const agentId = await makeAgent();
    const f = await makeFinding({ agentId, decided: 'accepted' });
    const app = await appWith();
    const created = (await app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` })).json() as EvalCase;

    const [suite] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId, agentId, agentVersion: 1, caseIds: [created.id], casesTotal: 1 })
      .returning();
    let res = await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('eval_run_in_progress');
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, created.id))).toHaveLength(1);

    await pg.handle.db.update(t.evalSuiteRuns).set({ status: 'done' }).where(eq(t.evalSuiteRuns.id, suite!.id));
    res = await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, created.id))).toHaveLength(0);

    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` })).statusCode).toBe(404);
    const foreignAgent = await makeAgent(foreignWorkspaceId);
    const [fc] = await pg.handle.db
      .insert(t.evalCases)
      .values({ workspaceId: foreignWorkspaceId, ownerKind: 'agent', ownerId: foreignAgent, name: 'x' })
      .returning();
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${fc!.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('the 31st POST in a minute answers 429 (NFR-4)', async () => {
    // The limiter is inert under nodeEnv "test" (server INSIGHTS 2026-10-07).
    const app = await appWith('development');
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await app.inject({ method: 'POST', url: `/findings/${randomUUID()}/eval-case` });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
    expect(statuses[30]).toBe(429);
    await app.close();
  });
  describe('edit and single-case run', () => {
    const editable = (c: EvalCase) => {
      const { source: _source, ...rest } = c.expected_output;
      return rest;
    };

    async function makeCase(decided: 'accepted' | 'dismissed' = 'accepted') {
      const agentId = await makeAgent();
      const f = await makeFinding({ agentId, decided });
      const app = await appWith();
      const res = await app.inject({ method: 'POST', url: `/findings/${f.findingId}/eval-case` });
      return { app, agentId, created: EvalCase.parse(res.json()) };
    }

    it('PATCH renames and re-ranges a case, keeps the frozen input and source', async () => {
      const { app, created } = await makeCase();
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: {
          name: 'Renamed case',
          expected_output: { ...editable(created), kind: 'must_not_flag', start_line: 11, end_line: 11 },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = EvalCase.parse(res.json());
      expect(body.name).toBe('Renamed case');
      expect(body.expected_output).toMatchObject({ kind: 'must_not_flag', start_line: 11, end_line: 11 });
      expect(body.expected_output.source).toEqual(created.expected_output.source);
      expect(body.input_diff).toBe(created.input_diff);
      await app.close();
    });

    it('PATCH refuses a file outside the frozen diff (422) and an unknown case (404)', async () => {
      const { app, created } = await makeCase();
      const bad = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: { expected_output: { ...editable(created), file: 'other.ts' } },
      });
      expect(bad.statusCode).toBe(422);
      expect((bad.json() as { error: { code: string } }).error.code).toBe('file_not_in_diff');
      const missing = await app.inject({ method: 'PATCH', url: `/eval-cases/${randomUUID()}`, payload: { name: 'x' } });
      expect(missing.statusCode).toBe(404);
      await app.close();
    });

    it('POST /agents/:id/eval-cases creates a hand-written case with a null source', async () => {
      const agentId = await makeAgent();
      const app = await appWith();
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/eval-cases`,
        payload: {
          name: 'stripe-key-leak',
          patch: PATCH,
          expected_output: { kind: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, title: 't', severity: 'WARNING', category: 'security' },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = EvalCase.parse(res.json());
      expect(body.owner_id).toBe(agentId);
      expect(body.expected_output).toMatchObject({ kind: 'must_find', file: 'src/config.ts', source: null });
      expect(body.input_files).toEqual(['src/config.ts']);
      expect(body.input_diff).toContain('+++ b/src/config.ts');
      const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });
      expect((list.json() as EvalCase[]).map((c) => c.id)).toContain(body.id);
      await app.close();
    });

    it('POST /agents/:id/eval-cases refuses a patch without a hunk (422) and an unknown agent (404)', async () => {
      const agentId = await makeAgent();
      const app = await appWith();
      const payload = {
        name: 'x',
        patch: 'no hunk here',
        expected_output: { kind: 'must_find', file: 'a.ts', start_line: 1, end_line: 1, title: 't', severity: 'WARNING', category: 'x' },
      };
      const bad = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-cases`, payload });
      expect(bad.statusCode).toBe(422);
      expect((bad.json() as { error: { code: string } }).error.code).toBe('invalid_diff');
      const missing = await app.inject({ method: 'POST', url: `/agents/${randomUUID()}/eval-cases`, payload });
      expect(missing.statusCode).toBe(404);
      await app.close();
    });

    it('POST /eval-cases/:id/run answers a result and stores nothing', async () => {
      const { app, created } = await makeCase();
      const before = (await pg.handle.db.select().from(t.evalSuiteRuns)).length;
      const res = await app.inject({ method: 'POST', url: `/eval-cases/${created.id}/run`, payload: {} });
      expect(res.statusCode).toBe(200);
      expect(['passed', 'failed', 'error']).toContain((res.json() as { outcome: string }).outcome);
      expect((await pg.handle.db.select().from(t.evalSuiteRuns)).length).toBe(before);
      const bad = await app.inject({
        method: 'POST',
        url: `/eval-cases/${created.id}/run`,
        payload: { expected_output: { ...editable(created), file: 'other.ts' } },
      });
      expect(bad.statusCode).toBe(422);
      const missing = await app.inject({ method: 'POST', url: `/eval-cases/${randomUUID()}/run`, payload: {} });
      expect(missing.statusCode).toBe(404);
      await app.close();
    });
  });
});
