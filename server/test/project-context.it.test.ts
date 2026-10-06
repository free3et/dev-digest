/**
 * Project Context routes (SPEC-2026-10-05-project-context-docs) — Fastify
 * `inject` over a temp-dir clone fixture, repo rows in a real Postgres.
 *
 * Covers AC-1, AC-2, AC-3, AC-10, AC-11, AC-13, AC-14, NFR-2, NFR-4.
 * Self-skips without Docker (see server INSIGHTS 2026-07-29).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextDocList, SpecFile } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...extra } as NodeJS.ProcessEnv);

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
type ErrBody = { error: { code: string; message: string } };

const UNICODE = '日本語€😀'; // 6 UTF-16 units, 16 UTF-8 bytes
const NOT_LISTED = 'path not in the document list';

d('project-context routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let base: string; // parent temp dir
  let clone: string; // the clone working tree
  let outside: string; // a folder outside the clone
  let repoId: string; // workspace W, clone_path = clone
  let noCloneRepoId: string;
  let missingDirRepoId: string;
  let foreignRepoId: string; // workspace B, clone_path = clone

  const getList = (id = repoId) => app.inject({ method: 'GET', url: `/repos/${id}/context` });
  const getFile = (path: string, id = repoId) =>
    app.inject({ method: 'GET', url: `/repos/${id}/context/file?path=${encodeURIComponent(path)}` });
  const putFile = (body: Record<string, unknown>, id = repoId) =>
    app.inject({ method: 'PUT', url: `/repos/${id}/context/file`, payload: body });
  const onDisk = (rel: string) => readFile(join(clone, rel), 'utf8');

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    base = await mkdtemp(join(tmpdir(), 'project-context-it-'));
    clone = join(base, 'clone');
    outside = join(base, 'outside');

    const [wsB] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const mk = async (workspace: string, name: string, clonePath: string | null) => {
      const [r] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: workspace, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
        .returning();
      return r!.id;
    };
    repoId = await mk(workspaceId, 'cloned', clone);
    noCloneRepoId = await mk(workspaceId, 'no-clone', null);
    missingDirRepoId = await mk(workspaceId, 'missing-dir', join(base, 'does-not-exist'));
    foreignRepoId = await mk(wsB!.id, 'foreign', clone);

    app = await buildApp({ config: config(), db: pg.handle.db });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  // Fresh tree per test: PUT cases mutate files.
  beforeEach(async () => {
    await rm(base + '/clone', { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
    const w = async (root: string, rel: string, text: string) => {
      const full = join(root, rel);
      await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
      await writeFile(full, text);
    };
    await w(clone, 'docs/a.md', '# A\n');
    await w(clone, 'specs/b.md', '# B\n');
    await w(clone, 'docs/specs/c.md', '# C\n');
    await w(clone, '.devdigest/specs/d.md', '# D\n');
    await w(clone, 'docs/unicode.md', UNICODE);
    await w(clone, 'docs/notes.txt', 'not markdown');
    await w(clone, 'node_modules/docs/x.md', 'x');
    await w(clone, 'vendor/docs/y.md', 'y');
    await w(clone, 'src/readme.md', 'no root');
    await w(clone, '.git/config', '[core]\n');
    await w(outside, 'secret.md', 'SECRET');
    await w(outside, 'dir/z.md', 'OUTSIDE-Z');
    await symlink(join(outside, 'secret.md'), join(clone, 'docs/link.md'));
    await symlink(join(outside, 'dir'), join(clone, 'docs/out'));
  });

  it('AC-1/AC-2: lists exactly the regular docs under the roots with doc_type and approx_tokens', async () => {
    const res = await getList();
    expect(res.statusCode).toBe(200);
    const body = ContextDocList.parse(res.json());

    expect(body.cloned).toBe(true);
    expect(Number.isNaN(Date.parse(body.refreshed_at))).toBe(false);
    // Sorted by path (code-unit order); no symlinks, no node_modules/vendor/.git, no non-root or non-md.
    expect(body.documents.map((x) => x.path)).toEqual([
      '.devdigest/specs/d.md',
      'docs/a.md',
      'docs/specs/c.md',
      'docs/unicode.md',
      'specs/b.md',
    ]);

    const byPath = Object.fromEntries(body.documents.map((x) => [x.path, x]));
    expect(byPath['docs/a.md']!.doc_type).toBe('docs');
    expect(byPath['specs/b.md']!.doc_type).toBe('specs');
    expect(byPath['docs/specs/c.md']!.doc_type).toBe('specs'); // deepest segment wins
    expect(byPath['.devdigest/specs/d.md']!.doc_type).toBe('specs');

    expect(byPath['docs/a.md']!.size).toBe(4);
    expect(byPath['docs/a.md']!.approx_tokens).toBe(1); // ceil(4 / 4)
    // Non-ASCII: size is bytes, tokens count UTF-16 code units.
    expect(byPath['docs/unicode.md']!.size).toBe(16);
    expect(byPath['docs/unicode.md']!.approx_tokens).toBe(Math.ceil(UNICODE.length / 4));
    expect(byPath['docs/unicode.md']!.approx_tokens).toBe(2);
    // List responses carry no content and no hash.
    for (const doc of body.documents) {
      expect(doc.content ?? null).toBeNull();
      expect(doc.content_hash ?? null).toBeNull();
    }
  });

  it('AC-3: no clone_path, or a clone directory that does not exist, gives cloned:false and no documents', async () => {
    for (const id of [noCloneRepoId, missingDirRepoId]) {
      const res = await getList(id);
      expect(res.statusCode).toBe(200);
      const body = ContextDocList.parse(res.json());
      expect(body.cloned).toBe(false);
      expect(body.documents).toEqual([]);
    }
  });

  it('AC-10: PUT replaces the bytes on disk; GET then returns the new content and a new hash', async () => {
    const before = await getFile('docs/a.md');
    expect(before.statusCode).toBe(200);
    const was = SpecFile.parse(before.json());
    expect(was.content).toBe('# A\n');
    expect(was.content_hash).toBe(sha256('# A\n'));

    const next = '# A, edited ✓\n';
    const put = await putFile({ path: 'docs/a.md', content: next, base_hash: was.content_hash });
    expect(put.statusCode).toBe(200);
    const saved = SpecFile.parse(put.json());
    expect(saved.content).toBe(next);
    expect(saved.content_hash).toBe(sha256(next));
    expect(saved.content_hash).not.toBe(was.content_hash);

    expect(await readFile(join(clone, 'docs/a.md'))).toEqual(Buffer.from(next, 'utf8'));
    const again = SpecFile.parse((await getFile('docs/a.md')).json());
    expect(again.content).toBe(next);
    expect(again.content_hash).toBe(saved.content_hash);
    // No temp file left behind in the folder.
    expect((await readdir(join(clone, 'docs'))).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  describe('AC-11: unsafe or unlisted paths answer 404 and touch nothing', () => {
    const cases: Array<[string, string]> = [
      ['not in a search root', 'src/readme.md'],
      ['listed-looking but missing', 'docs/missing.md'],
      ['not markdown', 'docs/notes.txt'],
      ['absolute', '/etc/passwd'],
      ['absolute path of a listed file', '__CLONE__/docs/a.md'],
      ['dot-dot (escapes the clone)', '../outside/secret.md'],
      ['dot-dot (inside the clone)', 'docs/../specs/b.md'],
      ['backslash', 'docs\\a.md'],
      ['NUL byte', 'docs/a.md\u0000'],
      ['.git', '.git/config'],
      ['excluded node_modules', 'node_modules/docs/x.md'],
      ['symlink leaf', 'docs/link.md'],
      ['file inside a symlinked folder', 'docs/out/z.md'],
    ];

    it.each(cases)('%s', async (_kind, raw) => {
      const path = raw.replace('__CLONE__', clone);

      const get = await getFile(path);
      expect(get.statusCode).toBe(404);
      expect((get.json() as ErrBody).error.code).toBe('not_found');
      expect((get.json() as ErrBody).error.message).toBe(NOT_LISTED);

      const put = await putFile({ path, content: 'PWNED', base_hash: 'whatever' });
      expect(put.statusCode).toBe(404);
      expect((put.json() as ErrBody).error.message).toBe(NOT_LISTED);

      // Nothing was written anywhere it could reach.
      expect(await readFile(join(outside, 'secret.md'), 'utf8')).toBe('SECRET');
      expect(await readFile(join(outside, 'dir/z.md'), 'utf8')).toBe('OUTSIDE-Z');
      expect((await readdir(outside)).sort()).toEqual(['dir', 'secret.md']);
      expect((await readdir(join(outside, 'dir'))).sort()).toEqual(['z.md']);
      expect(await onDisk('.git/config')).toBe('[core]\n');
      expect(await onDisk('docs/a.md')).toBe('# A\n');
      expect(await onDisk('src/readme.md')).toBe('no root');
      expect((await lstat(join(clone, 'docs/link.md'))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(clone, 'docs/out'))).isSymbolicLink()).toBe(true);
    });
  });

  it('AC-13: a stale base_hash answers 409 and leaves the file as it is on disk', async () => {
    const loaded = SpecFile.parse((await getFile('docs/a.md')).json());
    await writeFile(join(clone, 'docs/a.md'), 'changed elsewhere\n');

    const res = await putFile({ path: 'docs/a.md', content: 'my edit\n', base_hash: loaded.content_hash });
    expect(res.statusCode).toBe(409);
    const err = (res.json() as ErrBody).error;
    expect(err.code).toBe('conflict');
    expect(err.message).toBe('content changed since loaded');
    expect(await onDisk('docs/a.md')).toBe('changed elsewhere\n');
  });

  it('AC-14: content over 262 144 UTF-8 bytes answers 422 without writing; exactly at the cap is accepted', async () => {
    const hash0 = sha256('# A\n');
    const reject = async (content: string) => {
      const res = await putFile({ path: 'docs/a.md', content, base_hash: hash0 });
      expect(res.statusCode).toBe(422);
      expect((res.json() as ErrBody).error.code).toBe('validation_error');
      expect(await onDisk('docs/a.md')).toBe('# A\n');
    };
    await reject('a'.repeat(262_145)); // ASCII, one byte over
    await reject('€'.repeat(87_382)); // 262 146 bytes, only 87 382 UTF-16 units
    // Missing or wrong-typed fields are validation errors too.
    for (const body of [
      { path: 'docs/a.md', content: 'x' },
      { path: 'docs/a.md', content: 5, base_hash: hash0 },
      { content: 'x', base_hash: hash0 },
    ]) {
      expect((await putFile(body as Record<string, unknown>)).statusCode).toBe(422);
    }
    expect(await onDisk('docs/a.md')).toBe('# A\n');

    // Accepted: 262 143 bytes of 3-byte chars, then exactly 262 144 control chars.
    const euro = '€'.repeat(87_381);
    const ok1 = await putFile({ path: 'docs/a.md', content: euro, base_hash: hash0 });
    expect(ok1.statusCode).toBe(200);
    expect(await onDisk('docs/a.md')).toBe(euro);

    // Each \u0001 is escaped as 6 JSON chars (~1.5 MiB body): a 413 here would mean the
    // default 1 MiB bodyLimit still applies to this route.
    const ctrl = '\u0001'.repeat(262_144);
    const next = SpecFile.parse(ok1.json()).content_hash;
    const ok2 = await putFile({ path: 'docs/a.md', content: ctrl, base_hash: next });
    expect(ok2.statusCode).toBe(200);
    expect(Buffer.byteLength(await onDisk('docs/a.md'))).toBe(262_144);
    expect(await onDisk('docs/a.md')).toBe(ctrl);
  });

  it('NFR-2: a repo of another workspace (or an unknown id) answers 404 on all three routes', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    // Control: the same clone is served to the repo of the caller's own workspace.
    expect((await getList()).statusCode).toBe(200);
    expect((await getFile('docs/a.md')).statusCode).toBe(200);
    for (const id of [foreignRepoId, unknown]) {
      expect((await getList(id)).statusCode).toBe(404);
      expect((await getFile('docs/a.md', id)).statusCode).toBe(404);
      const put = await putFile({ path: 'docs/a.md', content: 'x', base_hash: sha256('# A\n') }, id);
      expect(put.statusCode).toBe(404);
    }
    expect(await onDisk('docs/a.md')).toBe('# A\n');
  });

  describe('NFR-4: observability', () => {
    let logApp: Awaited<ReturnType<typeof buildApp>>;
    const infoCalls: unknown[][] = [];

    beforeAll(async () => {
      // 'warn' keeps stdout quiet; the spy below records every req.log.info call anyway.
      logApp = await buildApp({ config: config({ LOG_LEVEL: 'warn' }), db: pg.handle.db });
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
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      await logApp?.close();
    });
    afterEach(() => {
      infoCalls.length = 0;
    });

    const saveLines = () =>
      infoCalls.filter(
        (a) => typeof a[0] === 'object' && a[0] !== null && 'repo_id' in (a[0] as object),
      );

    it('a successful PUT logs one line with repo id, path and new size, never the content', async () => {
      const secretText = '# Distinctive body text 7f3a9c\n';
      const res = await logApp.inject({
        method: 'PUT',
        url: `/repos/${repoId}/context/file`,
        payload: { path: 'docs/a.md', content: secretText, base_hash: sha256('# A\n') },
      });
      expect(res.statusCode).toBe(200);

      const lines = saveLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]![0]).toMatchObject({
        repo_id: repoId,
        path: 'docs/a.md',
        size: Buffer.byteLength(secretText),
      });
      // Only our own line: Fastify's request/response logs pass the raw req object (body included) to the spy; pino serializers strip it on the wire.
      expect(JSON.stringify(saveLines())).not.toContain('7f3a9c');

      // A rejected save (409) adds no "saved" line.
      const stale = await logApp.inject({
        method: 'PUT',
        url: `/repos/${repoId}/context/file`,
        payload: { path: 'docs/a.md', content: 'again', base_hash: sha256('# A\n') },
      });
      expect(stale.statusCode).toBe(409);
      expect(saveLines()).toHaveLength(1);
    });
  });
});
