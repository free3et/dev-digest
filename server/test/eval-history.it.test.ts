import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { EvalDashboardRow, EvalSuiteRun } from '@devdigest/shared';
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

d('eval history and dashboard (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let seq = 0;
  const t0 = Date.parse('2026-01-01T00:00:00Z');

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
      overrides: {
        git: new MockGitClient({}),
        github: new MockGitHubClient(),
        llm: {
          openai: new MockLLMProvider('openai'),
          anthropic: new MockLLMProvider('anthropic'),
          openrouter: new MockLLMProvider('openrouter'),
        },
      },
    });
  }

  async function makeAgent(name: string, o: { ws?: string; cases?: number } = {}) {
    const ws = o.ws ?? workspaceId;
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
      .returning();
    const n = o.cases ?? 1;
    if (n > 0) {
      await pg.handle.db.insert(t.evalCases).values(
        Array.from({ length: n }, (_, i) => ({
          workspaceId: ws,
          ownerKind: 'agent' as const,
          ownerId: a!.id,
          name: `case ${i}`,
        })),
      );
    }
    return a!.id;
  }

  interface SuiteSpec {
    status?: Status;
    /** Minutes after t0. */
    at: number;
    recall?: number | null;
    precision?: number | null;
    citation?: number | null;
    version?: number;
  }
  async function addSuites(agentId: string, specs: SuiteSpec[], ws = workspaceId) {
    const rows = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values(
        specs.map((s) => ({
          workspaceId: ws,
          agentId,
          agentVersion: s.version ?? 1,
          status: s.status ?? ('done' as Status),
          ranAt: new Date(t0 + s.at * 60_000),
          finishedAt: s.status === 'running' ? null : new Date(t0 + s.at * 60_000 + 1000),
          casesTotal: 1,
          casesCompleted: 1,
          casesPassed: 1,
          recall: s.recall === undefined ? 0.5 : s.recall,
          precision: s.precision === undefined ? 0.5 : s.precision,
          citationAccuracy: s.citation === undefined ? 0.5 : s.citation,
        })),
      )
      .returning();
    return rows;
  }

  const dashboard = async (app: Awaited<ReturnType<typeof appWith>>) => {
    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
    expect(res.statusCode).toBe(200);
    return z.array(EvalDashboardRow).parse(res.json());
  };

  it('lists at most 50 suites of an agent, newest first; unknown / foreign agent 404 (B-AC-4)', async () => {
    const agentId = await makeAgent(`History ${++seq}`);
    await addSuites(
      agentId,
      Array.from({ length: 55 }, (_, i) => ({ at: i })),
    );
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` });
    expect(res.statusCode).toBe(200);
    const list = z.array(EvalSuiteRun).parse(res.json());
    expect(list).toHaveLength(50);
    const times = list.map((s) => Date.parse(s.ran_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(times[0]).toBe(t0 + 54 * 60_000);
    expect(times[49]).toBe(t0 + 5 * 60_000);

    const foreign = await makeAgent(`Foreign ${++seq}`, { ws: foreignWorkspaceId });
    for (const id of [foreign, randomUUID()]) {
      expect((await app.inject({ method: 'GET', url: `/agents/${id}/eval-runs` })).statusCode).toBe(404);
    }
    // an agent with no suites: an empty list, not an error
    const none = await makeAgent(`NoRuns ${++seq}`);
    const empty = await app.inject({ method: 'GET', url: `/agents/${none}/eval-runs` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);
    await app.close();
  });

  it('dashboard rows: scope, latest finished, deltas, nulls, running flag and order (B-AC-10)', async () => {
    const db = pg.handle.db;
    const p = `Dash${++seq}`;
    const drop = await makeAgent(`${p} Zed drop`, { cases: 3 });
    const better = await makeAgent(`${p} alpha better`);
    const nullSide = await makeAgent(`${p} Mid null-recall`);
    const single = await makeAgent(`${p} Beta single`);
    const busy = await makeAgent(`${p} Busy`);
    const nothing = await makeAgent(`${p} Nothing run`);
    const noCases = await makeAgent(`${p} No cases`, { cases: 0 });
    const gone = await makeAgent(`${p} Deleted`);
    const foreign = await makeAgent(`${p} Foreign`, { ws: foreignWorkspaceId });

    await addSuites(drop, [
      { at: 1, recall: 0.8, precision: 0.7 },
      { at: 2, recall: 0.6, precision: 0.7 },
    ]);
    await addSuites(better, [
      { at: 1, recall: 0.4, precision: 0.5 },
      { at: 2, recall: 0.6, precision: 0.9 },
    ]);
    // latest has null recall (only must_not_flag cases): null delta, no drop
    await addSuites(nullSide, [
      { at: 1, recall: 0.9, precision: 0.5 },
      { at: 2, recall: null, precision: 0.5 },
    ]);
    await addSuites(single, [{ at: 1, recall: 0.3, precision: 0.3 }]);
    // failed and running runs are never "latest finished"; the running flag is set
    await addSuites(busy, [
      { at: 1, status: 'done', recall: 0.5, precision: 0.5 },
      { at: 2, status: 'partial', recall: 0.7, precision: 0.5 },
      { at: 3, status: 'failed', recall: null, precision: null, citation: null },
      { at: 4, status: 'running', recall: null, precision: null, citation: null },
    ]);
    await addSuites(gone, [{ at: 1 }, { at: 2 }]);
    await addSuites(foreign, [{ at: 1 }], foreignWorkspaceId);
    await db.delete(t.agents).where(eq(t.agents.id, gone));

    const app = await appWith();
    const all = await dashboard(app);
    const mine = all.filter((r) => r.agent_name.startsWith(p));
    const names = mine.map((r) => r.agent_name);

    // only agents with >= 1 case that still exist, in this workspace
    expect(names).not.toContain(`${p} No cases`);
    expect(names).not.toContain(`${p} Deleted`);
    expect(names).not.toContain(`${p} Foreign`);
    expect(mine.map((r) => r.agent_id)).not.toContain(noCases);
    expect(mine.map((r) => r.agent_id)).not.toContain(foreign);

    // drop rows first, then by name (case-insensitive)
    expect(names).toEqual([
      `${p} Zed drop`,
      `${p} alpha better`,
      `${p} Beta single`,
      `${p} Busy`,
      `${p} Mid null-recall`,
      `${p} Nothing run`,
    ]);
    // the whole list: every drop row precedes every non-drop row
    const firstNonDrop = all.findIndex((r) => !r.drop);
    expect(all.slice(firstNonDrop).some((r) => r.drop)).toBe(false);

    const row = (id: string) => mine.find((r) => r.agent_id === id)!;
    expect(row(drop)).toMatchObject({ drop: true, cases_total: 3, running: false });
    expect(row(drop).delta.recall).toBeCloseTo(-0.2, 6);
    expect(row(drop).delta.precision).toBeCloseTo(0, 6);
    expect(row(drop).latest!.recall).toBe(0.6);

    expect(row(better).drop).toBe(false);
    expect(row(better).delta.recall).toBeCloseTo(0.2, 6);
    expect(row(better).delta.precision).toBeCloseTo(0.4, 6);

    expect(row(nullSide).drop).toBe(false);
    expect(row(nullSide).delta.recall).toBeNull();
    expect(row(nullSide).delta.precision).toBeCloseTo(0, 6);

    expect(row(single).latest).not.toBeNull();
    expect(row(single).delta).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(row(single).drop).toBe(false);

    // latest finished is the `partial` run; its delta is against the older `done` run
    expect(row(busy).running).toBe(true);
    expect(row(busy).latest!.status).toBe('partial');
    expect(row(busy).delta.recall).toBeCloseTo(0.2, 6);

    expect(row(nothing).latest).toBeNull();
    expect(row(nothing).running).toBe(false);
    expect(row(nothing).delta).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(row(nothing).drop).toBe(false);
    await app.close();
  });

  it('a foreign workspace sees none of the default workspace rows (B-AC-10 scoping)', async () => {
    const db = pg.handle.db;
    const ownAgent = await makeAgent(`Scoped ${++seq}`);
    await addSuites(ownAgent, [{ at: 1 }]);
    const app = await appWith();
    expect((await dashboard(app)).map((r) => r.agent_id)).toContain(ownAgent);
    // the same agent id never shows up when it belongs to the other workspace
    const foreign = await makeAgent(`ForeignScoped ${++seq}`, { ws: foreignWorkspaceId });
    await addSuites(foreign, [{ at: 1 }], foreignWorkspaceId);
    const ids = (await dashboard(app)).map((r) => r.agent_id);
    expect(ids).not.toContain(foreign);
    const rows = await db.select().from(t.evalSuiteRuns).where(inArray(t.evalSuiteRuns.agentId, [foreign]));
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('dashboard p95 <= 300 ms with 20 agents x 50 runs (B-NFR-2)', async () => {
    const p = `Perf${++seq}`;
    for (let a = 0; a < 20; a++) {
      const agentId = await makeAgent(`${p} agent ${String(a).padStart(2, '0')}`);
      await addSuites(
        agentId,
        Array.from({ length: 50 }, (_, i) => ({
          at: i,
          status: i % 10 === 9 ? ('failed' as Status) : ('done' as Status),
          recall: (i % 5) / 5,
          precision: (i % 4) / 4,
        })),
      );
    }
    const app = await appWith();
    await dashboard(app); // warm the connection and plan cache
    const ms: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
      ms.push(performance.now() - start);
      expect(res.statusCode).toBe(200);
    }
    const sorted = [...ms].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    // eslint-disable-next-line no-console
    console.info(`eval dashboard p95 over 20 calls: ${p95.toFixed(1)} ms (max ${sorted.at(-1)!.toFixed(1)} ms)`);
    expect(p95).toBeLessThanOrEqual(300);
    await app.close();
  });
});
