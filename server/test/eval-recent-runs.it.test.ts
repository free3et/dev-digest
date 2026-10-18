import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { EvalRecentRun } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', ...extra } as NodeJS.ProcessEnv);

type Status = 'running' | 'done' | 'partial' | 'failed';

/**
 * Spec D: GET /eval/recent-runs. Own container: the default workspace is shared
 * by every test in this file, so each test seeds `ran_at` later than the
 * previous ones (base + test# x 10_000 minutes) and asserts only its own rows.
 */
d('eval recent runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let seq = 0;
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  const llm = {
    openai: new MockLLMProvider('openai'),
    anthropic: new MockLLMProvider('anthropic'),
    openrouter: new MockLLMProvider('openrouter'),
  };

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

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({}), github: new MockGitHubClient(), llm },
    });
  }

  async function makeAgent(name: string, ws = workspaceId) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
      .returning();
    return a!.id;
  }

  interface SuiteSpec {
    status?: Status;
    /** Minutes after this test's base. */
    at: number;
    recall?: number | null;
  }
  /** Returns a seeder bound to a per-test base so runs are newer than every earlier test's. */
  function base() {
    const origin = t0 + ++seq * 10_000 * 60_000;
    return async (agentId: string, specs: SuiteSpec[], ws = workspaceId) =>
      pg.handle.db
        .insert(t.evalSuiteRuns)
        .values(
          specs.map((s) => ({
            workspaceId: ws,
            agentId,
            agentVersion: 1,
            status: s.status ?? ('done' as Status),
            ranAt: new Date(origin + s.at * 60_000),
            finishedAt: s.status === 'running' ? null : new Date(origin + s.at * 60_000 + 1000),
            casesTotal: 1,
            casesCompleted: 1,
            casesPassed: 1,
            recall: s.recall === undefined ? 0.5 : s.recall,
            precision: 0.5,
            citationAccuracy: 0.5,
          })),
        )
        .returning();
  }

  const get = async (app: Awaited<ReturnType<typeof appWith>>, qs = '') =>
    app.inject({ method: 'GET', url: `/eval/recent-runs${qs}` });
  const parse = (res: { statusCode: number; json: () => unknown }) => {
    expect(res.statusCode).toBe(200);
    return z.array(EvalRecentRun).parse(res.json());
  };

  it('AC-1: default limit 10, finished only (partial included), newest first, with agent_name', async () => {
    const add = base();
    const a1 = await makeAgent(`Recent A ${seq}`);
    const a2 = await makeAgent(`Recent B ${seq}`);
    await add(
      a1,
      Array.from({ length: 6 }, (_, i) => ({ at: i, status: (i === 3 ? 'partial' : 'done') as Status })),
    );
    await add(
      a2,
      Array.from({ length: 6 }, (_, i) => ({ at: 10 + i, recall: i === 0 ? null : 0.5 })),
    );
    // newest rows are NOT finished: one running per agent (unique partial index), one failed
    await add(a1, [{ at: 100, status: 'running' }, { at: 101, status: 'failed' }]);
    await add(a2, [{ at: 102, status: 'running' }]);

    const list = parse(await get(await appWith()));
    expect(list).toHaveLength(10);
    const times = list.map((r) => Date.parse(r.ran_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(list.every((r) => r.status === 'done' || r.status === 'partial')).toBe(true);
    expect(list[0]!.agent_name).toBe(`Recent B ${seq}`);
    // 12 finished, 10 newest: a2 (at 10..15) and a1 (at 5,4,3,2); the partial one is at 3
    expect(list.some((r) => r.status === 'partial')).toBe(true);
    expect(list.filter((r) => r.agent_id === a2)).toHaveLength(6);
    // null metric survives as null, not 0 (a2's oldest run)
    expect(list.find((r) => r.recall === null)?.agent_id).toBe(a2);
  });

  it('AC-1: equal ran_at ties break by id descending', async () => {
    const add = base();
    const a = await makeAgent(`Tie ${seq}`);
    const rows = await add(a, [{ at: 1 }, { at: 1 }, { at: 1 }]);
    const mine = new Set(rows.map((r) => r.id));
    const list = parse(await get(await appWith(), '?limit=3'));
    expect(list.map((r) => r.id)).toEqual([...mine].sort().reverse());
  });

  it('AC-1: runs of a deleted agent are absent; a renamed agent shows the new name', async () => {
    const add = base();
    const gone = await makeAgent(`Gone ${seq}`);
    const kept = await makeAgent(`Before rename ${seq}`);
    const [goneRun] = await add(gone, [{ at: 9 }]);
    const [keptRun] = await add(kept, [{ at: 1 }]);
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, gone));
    await pg.handle.db.update(t.agents).set({ name: `After rename ${seq}` }).where(eq(t.agents.id, kept));
    const stillThere = await pg.handle.db
      .select()
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.id, goneRun!.id));
    expect(stillThere).toHaveLength(1);

    const list = parse(await get(await appWith(), '?limit=50'));
    expect(list.find((r) => r.id === goneRun!.id)).toBeUndefined();
    expect(list.find((r) => r.id === keptRun!.id)?.agent_name).toBe(`After rename ${seq}`);
  });

  it('AC-2: limit bounds the result, newest first', async () => {
    const add = base();
    const a = await makeAgent(`Limit ${seq}`);
    const rows = await add(
      a,
      Array.from({ length: 5 }, (_, i) => ({ at: i })),
    );
    const newest = [...rows].sort((x, y) => y.ranAt.getTime() - x.ranAt.getTime()).map((r) => r.id);
    const app = await appWith();
    expect(parse(await get(app, '?limit=3')).map((r) => r.id)).toEqual(newest.slice(0, 3));
    const all = parse(await get(app, '?limit=50'));
    expect(all.length).toBeLessThanOrEqual(50);
    expect(all.slice(0, 5).map((r) => r.id)).toEqual(newest);
  });

  it('AC-3: limit 0, 51, abc, 2.5 and empty answer 422 validation_error', async () => {
    const app = await appWith();
    for (const limit of ['0', '51', 'abc', '2.5', '']) {
      const res = await get(app, `?limit=${limit}`);
      expect(res.statusCode, `limit=${limit}`).toBe(422);
      expect(res.json().error?.code ?? res.json().code).toBe('validation_error');
    }
  });

  it('NFR-3: another workspace is never listed, even a foreign run on a local agent id', async () => {
    const add = base();
    const mine = await makeAgent(`Mine ${seq}`);
    const foreignAgent = await makeAgent(`Foreign ${seq}`, foreignWorkspaceId);
    await add(mine, [{ at: 1 }]);
    const [foreignRun] = await add(foreignAgent, [{ at: 50 }], foreignWorkspaceId);
    const [crossRun] = await add(mine, [{ at: 60 }], foreignWorkspaceId);
    const list = parse(await get(await appWith(), '?limit=50'));
    const ids = new Set(list.map((r) => r.id));
    expect(ids.has(foreignRun!.id)).toBe(false);
    expect(ids.has(crossRun!.id)).toBe(false);
    expect(list.some((r) => r.agent_id === foreignAgent)).toBe(false);
  });

  it('NFR-4: no model call is made by any of the GETs', async () => {
    const app = await appWith();
    await get(app);
    await get(app, '?limit=50');
    await get(app, '?limit=0');
    for (const p of Object.values(llm)) expect(p.calls.length).toBe(0);
  });
});
