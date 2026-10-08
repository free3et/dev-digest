/**
 * Project Context attach routes (SPEC-2026-10-05-project-context-attach) —
 * GET/PUT /agents/:id/context-docs over a temp-dir clone and a real Postgres.
 *
 * Covers AC-2, AC-3, AC-5, AC-9, AC-21, NFR-2, EC-3, EC-10, and the README 422 path rules
 * (outside roots, excluded segment, wrong suffix, traversal, symlink).
 * Self-skips without Docker (see server INSIGHTS 2026-07-29).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { AgentContextDocs, SkillContextDocs } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('project-context attach routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let base: string;
  let workspaceId: string;
  let repoId: string;
  let otherRepoId: string;
  let noCloneRepoId: string;
  let foreignRepoId: string;
  let agentId: string;
  let foreignAgentId: string;

  const get = (id: string, repo: string) =>
    app.inject({ method: 'GET', url: `/agents/${id}/context-docs?repo_id=${repo}` });
  const put = (id: string, repo: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/agents/${id}/context-docs`, payload: { repo_id: repo, paths } });
  const parse = (res: { json: () => unknown }) => AgentContextDocs.parse(res.json());

  const mkAgent = async (ws: string, name: string) => {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openai', model: 'm', systemPrompt: 'p' })
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
  const link = (skill: string, order: number, enabled = true) =>
    pg.handle.db.insert(t.agentSkills).values({ agentId, skillId: skill, order, enabled });
  const skillDocs = (skillId: string, paths: string[]) =>
    pg.handle.db
      .insert(t.skillContextDocs)
      .values(paths.map((path, i) => ({ skillId, repoId, path, order: i })));

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    base = await mkdtemp(join(tmpdir(), 'project-context-attach-it-'));
    const [wsB] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const mkRepo = async (ws: string, name: string, clonePath: string | null) => {
      const [r] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
        .returning();
      return r!.id;
    };
    repoId = await mkRepo(workspaceId, 'cloned', join(base, 'clone'));
    otherRepoId = await mkRepo(workspaceId, 'cloned2', join(base, 'clone'));
    noCloneRepoId = await mkRepo(workspaceId, 'no-clone', null);
    foreignRepoId = await mkRepo(wsB!.id, 'foreign', join(base, 'clone'));
    foreignAgentId = await mkAgent(wsB!.id, 'foreign-agent');
    app = await buildApp({ config: config(), db: pg.handle.db });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(join(base, 'clone'), { recursive: true, force: true });
    for (const [rel, text] of [
      ['docs/a.md', '# A\n'],
      ['docs/b.md', '# B\n'],
      ['specs/c.md', '# C\n'],
      ['docs/edge.md', 'x'.repeat(262144)],
      ['docs/big.md', 'x'.repeat(262145)],
    ] as const) {
      const full = join(base, 'clone', rel);
      await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
      await writeFile(full, text);
    }
    await pg.handle.db.delete(t.skills);
    await pg.handle.db.delete(t.agentContextDocs);
    agentId = await mkAgent(workspaceId, `agent-${Math.random()}`);
  });

  it('AC-2/AC-3: PUT then GET returns the same set in the same order; reorder is kept', async () => {
    const res = await put(agentId, repoId, ['specs/c.md', 'docs/a.md']);
    expect(res.statusCode).toBe(200);
    expect(parse(res).own.map((o) => o.path)).toEqual(['specs/c.md', 'docs/a.md']);
    expect(parse(await get(agentId, repoId)).own.map((o) => o.path)).toEqual(['specs/c.md', 'docs/a.md']);

    await put(agentId, repoId, ['docs/a.md', 'specs/c.md']);
    expect(parse(await get(agentId, repoId)).own.map((o) => o.path)).toEqual(['docs/a.md', 'specs/c.md']);
    expect(parse(await get(agentId, repoId)).own[0]).toMatchObject({
      doc_type: 'docs',
      missing: false,
      too_large: false,
      approx_tokens: 1,
    });
  });

  it('PUT replaces only that repo and an empty set clears it', async () => {
    await put(agentId, repoId, ['docs/a.md']);
    await put(agentId, otherRepoId, ['docs/b.md']);
    await put(agentId, repoId, ['specs/c.md']);
    expect(parse(await get(agentId, otherRepoId)).own.map((o) => o.path)).toEqual(['docs/b.md']);
    await put(agentId, repoId, []);
    expect(parse(await get(agentId, repoId)).own).toEqual([]);
    expect(parse(await get(agentId, otherRepoId)).own.map((o) => o.path)).toEqual(['docs/b.md']);
  });

  it('AC-5: inherited excludes disabled link and disabled skill, and does not repeat own paths', async () => {
    const s1 = await mkSkill('s1');
    const s2 = await mkSkill('s2');
    const s3 = await mkSkill('s3', false);
    const s4 = await mkSkill('s4');
    await link(s2, 0);
    await link(s1, 1);
    await link(s3, 2);
    await link(s4, 3, false);
    await skillDocs(s1, ['docs/a.md', 'docs/b.md']);
    await skillDocs(s2, ['specs/c.md', 'docs/b.md']);
    await skillDocs(s3, ['docs/edge.md']);
    await skillDocs(s4, ['docs/big.md']);
    await put(agentId, repoId, ['docs/a.md']);

    const body = parse(await get(agentId, repoId));
    expect(body.inherited.map((i) => [i.path, i.skill_name])).toEqual([
      ['specs/c.md', 's2'],
      ['docs/b.md', 's2'],
    ]);
  });

  it('EC-10/AC-9: no clone -> 200, every attachment missing with null tokens', async () => {
    await put(agentId, noCloneRepoId, []).then((r) => expect(r.statusCode).toBe(200));
    // Already attached paths stay valid even when the list is empty.
    await pg.handle.db
      .insert(t.agentContextDocs)
      .values({ agentId, repoId: noCloneRepoId, path: 'docs/a.md', order: 0 });
    const res = await get(agentId, noCloneRepoId);
    expect(res.statusCode).toBe(200);
    expect(parse(res).own).toEqual([
      { path: 'docs/a.md', doc_type: 'docs', approx_tokens: null, missing: true, too_large: false },
    ]);
  });

  it('AC-21/EC-3: 262144 bytes is fine, 262145 is too_large with null tokens', async () => {
    await put(agentId, repoId, ['docs/edge.md', 'docs/big.md']);
    const own = parse(await get(agentId, repoId)).own;
    expect(own[0]).toMatchObject({ too_large: false, missing: false, approx_tokens: 65536 });
    expect(own[1]).toMatchObject({ too_large: true, missing: false, approx_tokens: null });
  });

  it('AC-9: an attached file that disappears is reported missing, and stays PUT-able', async () => {
    await put(agentId, repoId, ['docs/a.md', 'docs/b.md']);
    await rm(join(base, 'clone', 'docs/a.md'));
    const own = parse(await get(agentId, repoId)).own;
    expect(own[0]).toMatchObject({ path: 'docs/a.md', missing: true, approx_tokens: null });
    expect((await put(agentId, repoId, ['docs/b.md', 'docs/a.md'])).statusCode).toBe(200);
  });

  it('422 for an unknown path and for duplicate paths; nothing is stored', async () => {
    const unknown = await put(agentId, repoId, ['docs/a.md', 'docs/nope.md']);
    expect(unknown.statusCode).toBe(422);
    const dup = await put(agentId, repoId, ['docs/a.md', 'docs/a.md']);
    expect(dup.statusCode).toBe(422);
    expect(parse(await get(agentId, repoId)).own).toEqual([]);
  });

  it('NFR-2: agent or repo of another workspace -> 404', async () => {
    expect((await get(foreignAgentId, repoId)).statusCode).toBe(404);
    expect((await put(foreignAgentId, repoId, [])).statusCode).toBe(404);
    expect((await get(agentId, foreignRepoId)).statusCode).toBe(404);
    expect((await put(agentId, foreignRepoId, ['docs/a.md'])).statusCode).toBe(404);
  });

  describe('422 path rules (server/README.md "PUT … cannot be attached")', () => {
    const skillPut = (id: string, repo: string, paths: string[]) =>
      app.inject({ method: 'PUT', url: `/skills/${id}/context-docs`, payload: { repo_id: repo, paths } });

    beforeEach(async () => {
      for (const [rel, text] of [
        ['notes/outside.md', '# not under a root\n'],
        ['docs/vendor/v.md', '# vendored\n'],
        ['docs/node_modules/n.md', '# dep\n'],
        ['docs/plain.txt', 'wrong suffix\n'],
      ] as const) {
        const full = join(base, 'clone', rel);
        await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
        await writeFile(full, text);
      }
      await symlink(join(base, 'clone', 'docs/a.md'), join(base, 'clone', 'docs/link.md'));
    });

    // Every one of these exists on disk (except the pure traversal shapes), so a 422 proves the
    // document-list rule rather than a missing file.
    const REJECTED = [
      ['outside the search roots', 'notes/outside.md'],
      ['excluded segment vendor', 'docs/vendor/v.md'],
      ['excluded segment node_modules', 'docs/node_modules/n.md'],
      ['wrong suffix', 'docs/plain.txt'],
      ['traversal inside the path', 'docs/../specs/c.md'],
      ['traversal above the clone', '../docs/a.md'],
      ['symlink to a listed file', 'docs/link.md'],
    ] as const;

    it.each(REJECTED)('agent PUT: %s -> 422 and nothing is stored', async (_kind, path) => {
      const res = await put(agentId, repoId, ['docs/a.md', path]);
      expect(res.statusCode).toBe(422);
      expect(parse(await get(agentId, repoId)).own).toEqual([]);
    });

    it.each(REJECTED)('skill PUT: %s -> 422 and nothing is stored', async (_kind, path) => {
      const s = await mkSkill(`rules-${Math.random()}`);
      const res = await skillPut(s, repoId, [path]);
      expect(res.statusCode).toBe(422);
      const got = await app.inject({ method: 'GET', url: `/skills/${s}/context-docs?repo_id=${repoId}` });
      expect(SkillContextDocs.parse(got.json()).docs).toEqual([]);
    });

    it('a rejected path that is already attached stays PUT-able (README omits this exception)', async () => {
      await pg.handle.db.insert(t.agentContextDocs).values({ agentId, repoId, path: 'docs/link.md', order: 0 });
      const res = await put(agentId, repoId, ['docs/a.md', 'docs/link.md']);
      expect(res.statusCode).toBe(200);
      expect(parse(res).own).toMatchObject([
        { path: 'docs/a.md', missing: false },
        { path: 'docs/link.md', missing: true, approx_tokens: null },
      ]);
    });
  });

  describe('skills (T10)', () => {
    const sget = (id: string, repo: string) =>
      app.inject({ method: 'GET', url: `/skills/${id}/context-docs?repo_id=${repo}` });
    const sput = (id: string, repo: string, paths: string[]) =>
      app.inject({ method: 'PUT', url: `/skills/${id}/context-docs`, payload: { repo_id: repo, paths } });
    const sparse = (res: { json: () => unknown }) => SkillContextDocs.parse(res.json());

    it('AC-6: PUT/GET round trip keeps order; 422 for an unknown path', async () => {
      const s = await mkSkill('rt');
      const res = await sput(s, repoId, ['specs/c.md', 'docs/a.md']);
      expect(res.statusCode).toBe(200);
      expect(sparse(res).docs.map((x) => x.path)).toEqual(['specs/c.md', 'docs/a.md']);
      expect(sparse(await sget(s, repoId)).docs.map((x) => x.path)).toEqual(['specs/c.md', 'docs/a.md']);
      expect((await sput(s, repoId, ['docs/nope.md'])).statusCode).toBe(422);
      expect((await sput(s, repoId, ['docs/a.md', 'docs/a.md'])).statusCode).toBe(422);
    });

    it('used_by_agents counts a disabled agent and excludes a disabled link', async () => {
      const s = await mkSkill('used');
      const disabledAgent = await mkAgent(workspaceId, `off-${Math.random()}`);
      await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, disabledAgent));
      const offLinkAgent = await mkAgent(workspaceId, `offlink-${Math.random()}`);
      await link(s, 0);
      await pg.handle.db.insert(t.agentSkills).values({ agentId: disabledAgent, skillId: s, order: 0, enabled: true });
      await pg.handle.db.insert(t.agentSkills).values({ agentId: offLinkAgent, skillId: s, order: 0, enabled: false });
      expect(sparse(await sget(s, repoId)).used_by_agents).toBe(2);
    });

    it('AC-2/AC-5: a skill PUT changes the agent inherited rows; switches off removes them', async () => {
      const s = await mkSkill('feeds-agent');
      await link(s, 0);
      const inherited = async () => parse(await get(agentId, repoId)).inherited.map((i) => [i.path, i.skill_name]);
      expect(await inherited()).toEqual([]);

      await sput(s, repoId, ['docs/a.md', 'specs/c.md']);
      expect(await inherited()).toEqual([
        ['docs/a.md', 'feeds-agent'],
        ['specs/c.md', 'feeds-agent'],
      ]);
      await sput(s, repoId, ['specs/c.md']);
      expect(await inherited()).toEqual([['specs/c.md', 'feeds-agent']]);

      await pg.handle.db.update(t.agentSkills).set({ enabled: false }).where(eq(t.agentSkills.skillId, s));
      expect(await inherited()).toEqual([]);
      await pg.handle.db.update(t.agentSkills).set({ enabled: true }).where(eq(t.agentSkills.skillId, s));
      await pg.handle.db.update(t.skills).set({ enabled: false }).where(eq(t.skills.id, s));
      expect(await inherited()).toEqual([]);
    });

    it('NFR-2: skill or repo of another workspace -> 404', async () => {
      const [fs] = await pg.handle.db
        .insert(t.skills)
        .values({
          workspaceId: (await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, foreignAgentId)))[0]!.workspaceId,
          name: 'foreign-skill',
          description: 'd',
          type: 'custom',
          source: 'manual',
          body: 'b',
        })
        .returning();
      const own = await mkSkill('own');
      expect((await sget(fs!.id, repoId)).statusCode).toBe(404);
      expect((await sput(fs!.id, repoId, [])).statusCode).toBe(404);
      expect((await sget(own, foreignRepoId)).statusCode).toBe(404);
      expect((await sput(own, foreignRepoId, ['docs/a.md'])).statusCode).toBe(404);
    });

    it('AC-21: 262145 bytes is too_large with null tokens', async () => {
      const s = await mkSkill('big');
      await sput(s, repoId, ['docs/edge.md', 'docs/big.md']);
      const docs = sparse(await sget(s, repoId)).docs;
      expect(docs[0]).toMatchObject({ too_large: false, approx_tokens: 65536 });
      expect(docs[1]).toMatchObject({ too_large: true, missing: false, approx_tokens: null });
    });
  });
});
