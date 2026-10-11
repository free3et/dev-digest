import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { PrBrief, PrBriefResponse, type LLMProvider } from '@devdigest/shared';import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...extra } as NodeJS.ProcessEnv);

const SECRET_TITLE = 'DISTINCTIVE-PR-TITLE-4c1f';

const FIXTURE = {
  risks: [
    { kind: 'data', title: 'Low risk', explanation: 'minor', severity: 'low', file_refs: ['src/a.ts'] },
    { kind: 'security', title: 'High risk', explanation: 'major', severity: 'high', file_refs: ['src/a.ts', 'ghost.ts'] },
    { kind: 'other', title: 'Invented', explanation: 'none', severity: 'high', file_refs: ['ghost.ts'] },
  ],
  review_focus: [{ file: 'src/b.ts', line: 42, reason: 'look here' }],
  summary: 'The change touches two files.',
};

/** A repo-intel facade that has no index: degraded, no changed symbols (AC-11). */
const emptyRepoIntel = {
  getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true }),
} as unknown as RepoIntel;

d('PR brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prSeq = 100;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'brief', fullName: 'acme/brief' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function createPr(ws = workspaceId, repo = repoId) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo,
        number: ++prSeq,
        title: SECRET_TITLE,
        author: 'a',
        branch: 'feat',
        base: 'main',
        headSha: 'head-1',
        additions: 4,
        deletions: 1,
        filesCount: 2,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values(
      ['src/a.ts', 'src/b.ts'].map((path) => ({ prId: pr!.id, path, additions: 2, deletions: 0 })),
    );
    return pr!.id;
  }

  /** Both providers are mocked: the default `risk_brief` provider is openai, an override may pick openrouter. */
  function appWith(opts: { nodeEnv?: string; llm?: Partial<Record<'openai' | 'openrouter', LLMProvider>> } = {}) {
    const openai = new MockLLMProvider('openai', { structuredBySchema: { pr_brief: FIXTURE } });
    const openrouter = new MockLLMProvider('openai', { structuredBySchema: { pr_brief: FIXTURE } });
    const app = buildApp({
      config: config(opts.nodeEnv ? { NODE_ENV: opts.nodeEnv, LOG_LEVEL: 'silent' } : {}),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({}),
        github: new MockGitHubClient(),
        repoIntel: emptyRepoIntel,
        llm: {
          openai: opts.llm?.openai ?? openai,
          openrouter: opts.llm?.openrouter ?? (openrouter as unknown as LLMProvider),
        },
      },
    });
    const count = () => openai.calls.filter((c) => c.method === 'completeStructured').length
      + openrouter.calls.filter((c) => c.method === 'completeStructured').length;
    return { app, openai, openrouter, count };
  }

  const storedJson = async (prId: string) => {
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return rows;
  };

  it('GET on a fresh PR returns exactly {brief:null, stale:false} with zero LLM calls (AC-2, AC-3)', async () => {
    const prId = await createPr();
    const { app, count } = appWith();
    const res = await (await app).inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false });
    expect(count()).toBe(0);
    await (await app).close();
  });

  it('POST generates, stores one row (json.head_sha), and a second POST overwrites it (AC-4, AC-5, AC-11)', async () => {
    const prId = await createPr();
    const { app: appP, count } = appWith();
    const app = await appP;

    const first = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(first.statusCode).toBe(200);
    const brief = PrBrief.parse(first.json());
    expect(count()).toBe(1);
    expect(brief.head_sha).toBe('head-1');
    expect(brief.risks.risks.map((r) => r.title)).toEqual(['High risk', 'Low risk']);
    expect(brief.risks.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(brief.review_focus).toEqual([{ file: 'src/b.ts', line: null, reason: 'look here' }]);
    // AC-11: no intent row, no blast
    expect(brief.intent).toBeNull();
    expect(brief.blast).toBeNull();
    expect(brief.missing_inputs).toEqual(expect.arrayContaining(['intent', 'blast']));

    const second = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(second.statusCode).toBe(200);
    expect(count()).toBe(2);
    const rows = await storedJson(prId);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as { head_sha: string }).head_sha).toBe('head-1');
    await app.close();
  });

  it('GET serves the stored brief with zero calls, fast, then flags it stale after a new head (AC-1, AC-3, NFR-2)', async () => {
    const prId = await createPr();
    const { app: appP, count } = appWith();
    const app = await appP;
    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const before = count();

    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(Date.now() - started).toBeLessThan(1000);
    const body = PrBriefResponse.parse(res.json());
    expect(body.brief).not.toBeNull();
    expect(body.stale).toBe(false);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'head-2' }).where(eq(t.pullRequests.id, prId));
    const stale = PrBriefResponse.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json());
    expect(stale.stale).toBe(true);
    expect(stale.brief!.head_sha).toBe('head-1');
    expect(count()).toBe(before);
    await app.close();
  });

  it('a failing provider gives 409 brief_unavailable and leaves the stored row identical (AC-12)', async () => {
    const prId = await createPr();
    const ok = await appWith().app;
    await ok.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    await ok.close();
    const before = await storedJson(prId);

    const failing = { id: 'openai', completeStructured: async () => { throw new Error('provider down'); } } as unknown as LLMProvider;
    const bad = await appWith({ llm: { openai: failing } }).app;
    const res = await bad.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('brief_unavailable');
    expect(await storedJson(prId)).toEqual(before);
    await bad.close();
  });

  it('a concurrent POST for the same PR gets 409 brief_in_progress (AC-25)', async () => {
    const prId = await createPr();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = new MockLLMProvider('openai', { structuredBySchema: { pr_brief: FIXTURE } });
    const held = {
      id: 'openai',
      completeStructured: async (req: never) => {
        await gate;
        return inner.completeStructured(req);
      },
    } as unknown as LLMProvider;
    const app = await appWith({ llm: { openai: held } }).app;

    const a = app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const b = app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const tag = (p: typeof a, n: string) => p.then((r) => ({ n, r }));
    const first = await Promise.race([tag(a, 'a'), tag(b, 'b')]);
    expect(first.r.statusCode).toBe(409);
    expect(first.r.json().error.code).toBe('brief_in_progress');
    release();
    const other = first.n === 'a' ? await b : await a;
    expect(other.statusCode).toBe(200);
    await app.close();
  });

  it('404s for a PR in another workspace on GET and POST, without calling the LLM (NFR-4)', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-brief' }).returning();
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'zed', name: 'x', fullName: 'zed/x' })
      .returning();
    const foreign = await createPr(other!.id, otherRepo!.id);
    const { app: appP, count } = appWith();
    const app = await appP;
    expect((await app.inject({ method: 'GET', url: `/pulls/${foreign}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${foreign}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' })).statusCode).toBe(422);
    expect(count()).toBe(0);
    await app.close();
  });

  it('rate-limits the 6th POST in a minute with 429 (NFR-4)', async () => {
    const prId = await createPr();
    // The rate-limit plugin is skipped when nodeEnv === 'test', so build a development app.
    const app = await appWith({ nodeEnv: 'development' }).app;
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).statusCode);
    }
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
    await app.close();
  });

  describe('observability (NFR-6)', () => {
    const infoCalls: unknown[][] = [];
    afterEach(() => {
      vi.restoreAllMocks();
      infoCalls.length = 0;
    });

    it('one generation logs one brief line that never contains PR text', async () => {
      const prId = await createPr();
      const logApp = await buildApp({
        config: config({ LOG_LEVEL: 'warn' }),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({}),
          github: new MockGitHubClient(),
          repoIntel: emptyRepoIntel,
          llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { pr_brief: FIXTURE } }) },
        },
      });
      const realChild = logApp.log.child.bind(logApp.log);
      vi.spyOn(logApp.log, 'child').mockImplementation(((bindings: never, opts: never) => {
        const child = realChild(bindings, opts);
        const info = child.info.bind(child);
        child.info = ((...args: unknown[]) => {
          infoCalls.push(args);
          return (info as (...a: unknown[]) => void)(...args);
        }) as typeof child.info;
        return child;
      }) as typeof logApp.log.child);

      const res = await logApp.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
      expect(res.statusCode).toBe(200);
      const lines = infoCalls.filter((a) => a[1] === 'pr brief generated');
      expect(lines).toHaveLength(1);
      const text = JSON.stringify(lines[0]);
      expect(text).not.toContain(SECRET_TITLE);
      expect(text).not.toContain(FIXTURE.summary);
      await logApp.close();
    });
  });

  it('GET returns a seeded pr_brief row verbatim with zero LLM calls (AC-1)', async () => {
    const prId = await createPr();
    const seeded: PrBrief = {
      summary: 'SEEDED-SUMMARY',
      risks: { risks: [{ kind: 'k', title: 'Seeded risk', explanation: 'e', severity: 'medium', file_refs: ['src/a.ts'] }] },
      review_focus: [{ file: 'src/b.ts', line: 3, reason: 'seeded reason' }],
      intent: null,
      blast: null,
      head_sha: 'head-1',
      generated_at: '2026-10-07T00:00:00.000Z',
      model: 'seed-model',
      cost_usd: null,
      missing_inputs: ['intent'],
      intent_stale: false,
      truncated_inputs: [],
    };
    await pg.handle.db.insert(t.prBrief).values({ prId, json: seeded });
    const { app: appP, count } = appWith();
    const app = await appP;
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: seeded, stale: false });
    expect(count()).toBe(0);
    await app.close();
  });

  it('regenerating after the head moved replaces the stored brief (still one row) and clears stale (AC-5, AC-3)', async () => {
    const prId = await createPr();
    const { app: appP } = appWith();
    const app = await appP;
    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'head-2' }).where(eq(t.pullRequests.id, prId));
    expect(PrBriefResponse.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json()).stale).toBe(true);

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    const rows = await storedJson(prId);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as { head_sha: string }).head_sha).toBe('head-2');
    const after = PrBriefResponse.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json());
    expect(after).toMatchObject({ stale: false, brief: { head_sha: 'head-2' } });
    await app.close();
  });

  // Last: it writes a workspace setting that later brief generations would pick up.
  it('uses the workspace model override for risk_brief with exactly one call (AC-4)', async () => {
    const prId = await createPr();
    const { app: appP, openai, openrouter, count } = appWith();
    const app = await appP;
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'vendor/brief-model' } } },
    });
    expect(put.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().model).toBe('vendor/brief-model');
    expect(count()).toBe(1);
    expect(openai.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
    const req = openrouter.calls.find((c) => c.method === 'completeStructured')!.req as { model: string };
    expect(req.model).toBe('vendor/brief-model');
    await app.close();
  });
});
