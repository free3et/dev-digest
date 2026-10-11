/**
 * NFR-1 timing (SPEC-2026-10-05-project-context-docs): GET /repos/:id/context over a
 * 20 000-file clone with 500 matching `.md` must answer in p95 <= 500 ms.
 *
 * Opt-in and non-gating: skipped unless DEVDIGEST_PERF=1 (and Docker is available).
 *   cd server && DEVDIGEST_PERF=1 pnpm exec vitest run project-context-perf --testTimeout=60000
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextDocList } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const enabled = process.env.DEVDIGEST_PERF === '1' && (await dockerAvailable());
const d = enabled ? describe : describe.skip;

const TOTAL_FILES = 20_000;
const MD_FILES = 500;
const WARMUP = 3;
const RUNS = 20;
const BUDGET_MS = 500;

d('NFR-1: project-context list timing (opt-in, Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let base: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    base = await mkdtemp(join(tmpdir(), 'project-context-perf-'));
    const clone = join(base, 'clone');

    // 500 matching docs spread over the three search roots.
    const roots = ['specs', 'docs', '.devdigest/specs'];
    const jobs: Array<[string, string]> = [];
    for (let i = 0; i < MD_FILES; i++) {
      jobs.push([join(clone, roots[i % roots.length]!, `g${i % 25}`, `doc-${i}.md`), `# Doc ${i}\n`]);
    }
    // The rest: ordinary source files in 200 directories.
    for (let i = 0; i < TOTAL_FILES - MD_FILES; i++) {
      jobs.push([join(clone, 'src', `d${i % 200}`, `f${i}.ts`), `export const v${i} = ${i};\n`]);
    }
    const dirs = new Set(jobs.map(([p]) => p.slice(0, p.lastIndexOf('/'))));
    await Promise.all([...dirs].map((dir) => mkdir(dir, { recursive: true })));
    for (let i = 0; i < jobs.length; i += 500) {
      await Promise.all(jobs.slice(i, i + 500).map(([p, text]) => writeFile(p, text)));
    }

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'perf', fullName: 'acme/perf', clonePath: clone })
      .returning();
    repoId = repo!.id;
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'warn' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  it(`p95 of ${RUNS} GET /repos/:id/context <= ${BUDGET_MS} ms`, async () => {
    const get = () => app.inject({ method: 'GET', url: `/repos/${repoId}/context` });

    for (let i = 0; i < WARMUP; i++) expect((await get()).statusCode).toBe(200);

    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      const res = await get();
      times.push(performance.now() - start);
      expect(res.statusCode).toBe(200);
      if (i === 0) expect(ContextDocList.parse(res.json()).documents).toHaveLength(MD_FILES);
    }

    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1]!;
    console.log(
      `[perf] NFR-1 GET /repos/:id/context ${TOTAL_FILES} files / ${MD_FILES} md: ` +
        `p95=${p95.toFixed(1)} ms, median=${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)} ms, ` +
        `max=${sorted[sorted.length - 1]!.toFixed(1)} ms`,
    );
    expect(p95).toBeLessThanOrEqual(BUDGET_MS);
  }, 60_000);
});
