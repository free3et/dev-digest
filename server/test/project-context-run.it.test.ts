/**
 * Project Context injection into review runs (SPEC-2026-10-05-project-context-attach).
 * Covers AC-10, AC-12, AC-13, AC-16, NFR-3, NFR-4, NFR-6, EC-7. Mock LLM on every provider
 * (including openrouter), real fs store over a temp clone, real Postgres.
 * Self-skips without Docker.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Review, RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { FsContextDocStore } from '../src/adapters/context-docs/fs-store.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const fileDiff = (path: string) => `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1,2 +1,3 @@
 keep
+added line in ${path}
 tail`;
const TWO_FILE_DIFF = `${fileDiff('src/one.ts')}\n${fileDiff('src/two.ts')}`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

d('project context in runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let base: string;
  let workspaceId: string;
  let repoId: string;
  let otherRepoId: string;
  let prId: string;
  let seq = 0;
  let currentDiff = DIFF;
  let openai: MockLLMProvider;
  const readPaths: string[] = [];

  const mkAgent = async (strategy: 'single-pass' | 'map-reduce' = 'single-pass') => {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `agent-${seq++}`, provider: 'openai', model: 'm', systemPrompt: 'p', strategy })
      .returning();
    return a!.id;
  };
  const mkSkill = async (name: string, enabled = true) => {
    const [s] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b', enabled })
      .returning();
    return s!.id;
  };
  const attach = (agentId: string, paths: string[], repo = repoId) =>
    pg.handle.db.insert(t.agentContextDocs).values(paths.map((path, i) => ({ agentId, repoId: repo, path, order: i })));
  const attachSkill = (skillId: string, paths: string[], repo = repoId) =>
    pg.handle.db.insert(t.skillContextDocs).values(paths.map((path, i) => ({ skillId, repoId: repo, path, order: i })));
  const linkSkill = (agentId: string, skillId: string, order: number) =>
    pg.handle.db.insert(t.agentSkills).values({ agentId, skillId, order, enabled: true });

  /** Run one agent on the shared PR and return its persisted trace + run status. */
  const runAgent = async (agentId: string) => {
    const before = (await pg.handle.db.select().from(t.agentRuns)).filter((r) => r.prId === prId).length;
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: before + 1 });
    const status = runs.find((r) => r.id === runId)!.status;
    // completeAgentRun lands before saveRunTrace: poll until the trace document exists.
    let trace!: RunTrace;
    for (let i = 0; i < 200; i++) {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (res.statusCode === 200) {
        trace = res.json() as RunTrace;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(trace).toBeDefined();
    return { runId, status, trace };
  };
  const contextLines = (trace: RunTrace) => trace.log.filter((l) => l.msg.startsWith('project context:'));

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    base = await mkdtemp(join(tmpdir(), 'project-context-run-it-'));
    const mkRepo = async (name: string, clonePath: string | null) => {
      const [r] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
        .returning();
      return r!.id;
    };
    repoId = await mkRepo('ctx-run', join(base, 'clone'));
    otherRepoId = await mkRepo('ctx-run-other', join(base, 'clone'));
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 7,
        title: 'Add key',
        author: 'a',
        branch: 'feat',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'body',
      })
      .returning();
    prId = pr!.id;
    await pg.handle.db.insert(t.prFiles).values({
      prId,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const mock = (id: 'openai' | 'anthropic' | 'openrouter') => new MockLLMProvider(id as 'openai', { structured: EMPTY_REVIEW });
    openai = mock('openai');
    const git = new MockGitClient({ diff: DIFF });
    git.diff = async () => parseUnifiedDiff(currentDiff);
    // Real fs store that records every read, to pin that an oversize doc is never read.
    const fsStore = new FsContextDocStore();
    const contextDocs = {
      list: fsStore.list.bind(fsStore),
      resolve: fsStore.resolve.bind(fsStore),
      size: fsStore.size.bind(fsStore),
      writeAtomic: fsStore.writeAtomic.bind(fsStore),
      read: (abs: string) => {
        readPaths.push(abs);
        return fsStore.read(abs);
      },
    };
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        contextDocs,
        llm: { openai, anthropic: mock('anthropic'), openrouter: mock('openrouter') },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(join(base, 'clone'), { recursive: true, force: true });
    for (const [rel, text] of [
      ['docs/a.md', '# A own\n'],
      ['docs/b.md', '# B skill\n'],
      ['specs/c.md', '# C other repo\n'],
      ['docs/big.md', 'x'.repeat(262145)],
    ] as const) {
      const full = join(base, 'clone', rel);
      await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
      await writeFile(full, text);
    }
    await symlink(join(base, 'clone', 'docs/a.md'), join(base, 'clone', 'docs/link.md'));
    await pg.handle.db.delete(t.skills);
    await pg.handle.db.delete(t.agentContextDocs);
    currentDiff = DIFF;
  });

  /** Review-pass calls (excludes the intent call) made during `fn`, with their user messages. */
  const reviewCalls = async (fn: () => Promise<unknown>) => {
    const start = openai.calls.length;
    await fn();
    return openai.calls
      .slice(start)
      .filter((c) => c.method === 'completeStructured')
      .map((c) => c.req as { schemaName: string; messages: { role: string; content: string }[] })
      .filter((r) => r.schemaName === 'Review');
  };

  it('AC-10/AC-13: own docs then skill docs, labels are paths, local edit included, other repo absent', async () => {
    const agentId = await mkAgent();
    const skill = await mkSkill('s1');
    await linkSkill(agentId, skill, 0);
    await attach(agentId, ['docs/a.md']);
    await attach(agentId, ['specs/c.md'], otherRepoId);
    await attachSkill(skill, ['docs/b.md', 'docs/a.md']);
    await writeFile(join(base, 'clone', 'docs/a.md'), '# A edited locally\n');

    const { status, trace } = await runAgent(agentId);
    expect(status).toBe('done');
    expect(trace.specs_read).toEqual(['docs/a.md', 'docs/b.md']);
    expect(trace.specs_tokens).toEqual([
      { path: 'docs/a.md', approx_tokens: Math.ceil('# A edited locally\n'.length / 4) },
      { path: 'docs/b.md', approx_tokens: Math.ceil('# B skill\n'.length / 4) },
    ]);
    expect(trace.specs_missing).toEqual([]);
    const specs = trace.prompt_assembly.specs!;
    expect(specs.startsWith('## Project context')).toBe(true);
    expect(specs.indexOf('<untrusted source="docs/a.md">')).toBeGreaterThan(-1);
    expect(specs.indexOf('<untrusted source="docs/a.md">')).toBeLessThan(specs.indexOf('<untrusted source="docs/b.md">'));
    expect(specs).toContain('# A edited locally');
    expect(specs).not.toContain('specs/c.md');
    expect(trace.prompt_assembly.user).toContain('# A edited locally');
    expect(contextLines(trace)).toHaveLength(1);
    expect(contextLines(trace)[0]!.msg).toMatch(/^project context: 2 docs, \+~\d+ tokens$/);
  });

  it('AC-12/NFR-6: missing, symlink and oversize docs are skipped, run ends done, one `, 3 skipped` line', async () => {
    const agentId = await mkAgent();
    await attach(agentId, ['docs/a.md', 'docs/gone.md', 'docs/link.md', 'docs/big.md']);

    const { status, trace } = await runAgent(agentId);
    expect(status).toBe('done');
    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.specs_missing).toEqual(['docs/gone.md', 'docs/link.md', 'docs/big.md']);
    const specs = trace.prompt_assembly.specs!;
    for (const p of trace.specs_missing!) expect(specs).not.toContain(p);
    expect(contextLines(trace)).toHaveLength(1);
    expect(contextLines(trace)[0]!.msg).toMatch(/^project context: 1 docs, \+~\d+ tokens, 3 skipped$/);
  });

  it('AC-16/NFR-4: no attachments -> empty specs_read, null specs, same user message, one 0-doc line', async () => {
    const withOther = await mkAgent();
    await attach(withOther, ['specs/c.md'], otherRepoId);
    const baseline = await runAgent(await mkAgent());
    const other = await runAgent(withOther);

    for (const r of [baseline, other]) {
      expect(r.status).toBe('done');
      expect(r.trace.specs_read).toEqual([]);
      expect(r.trace.prompt_assembly.specs).toBeNull();
      expect(contextLines(r.trace).map((l) => l.msg)).toEqual(['project context: 0 docs, +~0 tokens']);
    }
    expect(other.trace.prompt_assembly.user).toBe(baseline.trace.prompt_assembly.user);
  });

  it('all attached docs skipped -> no section, line carries `, 1 skipped`', async () => {
    const agentId = await mkAgent();
    await attach(agentId, ['docs/big.md']);
    readPaths.length = 0;
    const { status, trace } = await runAgent(agentId);
    expect(status).toBe('done');
    expect(readPaths.filter((p) => p.endsWith('big.md'))).toEqual([]); // skipped on size, never read
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.specs_missing).toEqual(['docs/big.md']);
    expect(contextLines(trace).map((l) => l.msg)).toEqual(['project context: 0 docs, +~0 tokens, 1 skipped']);
  });

  it('NFR-6: a failing link query is logged and the run goes on with no injection', async () => {
    const agentId = await mkAgent();
    await attach(agentId, ['docs/a.md']);
    const baseline = await runAgent(await mkAgent());

    const links = app.container.contextDocLinksRepo;
    const original = links.agentDocs;
    links.agentDocs = async () => {
      throw new Error('links table unavailable');
    };
    let broken!: Awaited<ReturnType<typeof runAgent>>;
    try {
      broken = await runAgent(agentId);
    } finally {
      links.agentDocs = original;
    }

    expect(broken.status).toBe('done');
    expect(broken.trace.specs_read).toEqual([]);
    expect(broken.trace.specs_missing).toEqual([]);
    expect(broken.trace.prompt_assembly.specs).toBeNull();
    expect(broken.trace.prompt_assembly.user).toBe(baseline.trace.prompt_assembly.user);
    const failure = broken.trace.log.find((l) => l.msg.startsWith('context docs: could not load links'));
    expect(failure?.msg).toContain('links table unavailable');
    expect(contextLines(broken.trace).map((l) => l.msg)).toEqual(['project context: 0 docs, +~0 tokens']);
  });

  it('NG-7/AC-16: a failed run keeps empty specs_read and carries no specs_tokens / specs_missing', async () => {
    const agentId = await mkAgent();
    await attach(agentId, ['docs/a.md']);

    const original = openai.completeStructured;
    openai.completeStructured = async () => {
      throw new Error('model unavailable');
    };
    let failed!: Awaited<ReturnType<typeof runAgent>>;
    try {
      failed = await runAgent(agentId);
    } finally {
      openai.completeStructured = original;
    }

    expect(failed.status).toBe('failed');
    expect(failed.trace.specs_read).toEqual([]);
    expect(failed.trace).not.toHaveProperty('specs_tokens');
    expect(failed.trace).not.toHaveProperty('specs_missing');
    expect(failed.trace.prompt_assembly.specs).toBeNull();
  });

  describe.each([
    ['single-pass', 'single-pass', DIFF, 1],
    ['map-reduce', 'map-reduce', TWO_FILE_DIFF, 2],
  ] as const)('NFR-3/EC-7: %s', (_name, strategy, diff, chunks) => {
    it('attaching docs adds no model call, keeps cost_usd, repeats the section per chunk', async () => {
      currentDiff = diff;
      const plain = await mkAgent(strategy);
      const withDocs = await mkAgent(strategy);
      await attach(withDocs, ['docs/a.md', 'docs/b.md']);

      let base!: Awaited<ReturnType<typeof runAgent>>;
      let docs!: Awaited<ReturnType<typeof runAgent>>;
      const baseCalls = await reviewCalls(async () => (base = await runAgent(plain)));
      const docCalls = await reviewCalls(async () => (docs = await runAgent(withDocs)));

      expect(baseCalls).toHaveLength(chunks);
      expect(docCalls).toHaveLength(baseCalls.length);
      for (const c of baseCalls) expect(c.messages.find((m) => m.role === 'user')!.content).not.toContain('## Project context');
      for (const c of docCalls) {
        const user = c.messages.find((m) => m.role === 'user')!.content;
        expect(user).toContain('## Project context');
        expect(user).toContain('<untrusted source="docs/a.md">');
        expect(user).toContain('<untrusted source="docs/b.md">');
      }
      expect(docs.status).toBe('done');
      expect(docs.trace.specs_read).toEqual(['docs/a.md', 'docs/b.md']);

      for (const r of [base, docs]) {
        const [row] = (await pg.handle.db.select().from(t.agentRuns)).filter((x) => x.id === r.runId);
        expect(row!.costUsd).toBeCloseTo(0.001 * chunks, 6);
      }
    });
  });
});
