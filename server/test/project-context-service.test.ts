/**
 * ProjectContextService (ring 2) with MockContextDocStore and a stub repository —
 * hermetic: no DB, no filesystem. AC-3, AC-10, AC-11, AC-13, NFR-2.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { Container } from '../src/platform/container.js';
import { MockContextDocStore } from '../src/adapters/mocks.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import { ConflictError, NotFoundError } from '../src/platform/errors.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const WS = 'ws-1';
const OTHER_WS = 'ws-2';

describe('ProjectContextService', () => {
  let store: MockContextDocStore;
  let svc: ProjectContextService;
  let clonePath: string | null;

  beforeEach(() => {
    clonePath = '/clone';
    store = new MockContextDocStore({
      'docs/a.md': '# A\n',
      'specs/b.md': 'bb',
      'docs/specs/c.md': 'ccccc',
    });
    const container = {
      db: {},
      contextDocs: store,
      config: { contextRoots: ['specs', 'docs', 'insights'] },
    } as unknown as Container;
    const repo = {
      // Workspace scoping lives in the repository: another workspace sees nothing.
      getRepoForWorkspace: async (ws: string, id: string) =>
        ws === WS && id === 'repo-1' ? { id, clonePath } : undefined,
    };
    svc = new ProjectContextService(container, repo);
  });

  describe('list', () => {
    it('returns sorted items with doc_type and tokens, no content or hash (AC-1/AC-2)', async () => {
      const res = await svc.list(WS, 'repo-1');
      expect(res.cloned).toBe(true);
      expect(res.documents.map((d) => d.path)).toEqual(['docs/a.md', 'docs/specs/c.md', 'specs/b.md']);
      expect(res.documents.map((d) => d.doc_type)).toEqual(['docs', 'specs', 'specs']);
      expect(res.documents.map((d) => d.approx_tokens)).toEqual([1, 2, 1]);
      for (const d of res.documents) {
        expect(d.content ?? null).toBeNull();
        expect(d.content_hash ?? null).toBeNull();
      }
    });

    it('AC-3: no clone_path → cloned:false, empty list, store untouched', async () => {
      clonePath = null;
      store.listError = new Error('must not be called');
      const res = await svc.list(WS, 'repo-1');
      expect(res).toMatchObject({ cloned: false, documents: [] });
    });

    it('AC-3: a missing clone directory (ENOENT) → cloned:false; other errors propagate', async () => {
      store.listError = Object.assign(new Error('gone'), { code: 'ENOENT' });
      expect(await svc.list(WS, 'repo-1')).toMatchObject({ cloned: false, documents: [] });
      store.listError = Object.assign(new Error('denied'), { code: 'EACCES' });
      await expect(svc.list(WS, 'repo-1')).rejects.toThrow('denied');
    });

    it('NFR-2: another workspace or an unknown repo → NotFoundError', async () => {
      await expect(svc.list(OTHER_WS, 'repo-1')).rejects.toBeInstanceOf(NotFoundError);
      await expect(svc.list(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('readFile', () => {
    it('returns content, byte size and the sha256 of the bytes', async () => {
      const f = await svc.readFile(WS, 'repo-1', 'docs/a.md');
      expect(f).toMatchObject({ path: 'docs/a.md', content: '# A\n', size: 4, doc_type: 'docs' });
      expect(f.content_hash).toBe(sha('# A\n'));
    });

    it('AC-11: an unlisted path, or a repo without a clone, → 404 with the shared message', async () => {
      await expect(svc.readFile(WS, 'repo-1', 'src/x.md')).rejects.toMatchObject({
        statusCode: 404,
        message: 'path not in the document list',
      });
      clonePath = null;
      await expect(svc.readFile(WS, 'repo-1', 'docs/a.md')).rejects.toMatchObject({
        message: 'path not in the document list',
      });
    });

    it('NFR-2: another workspace → NotFoundError', async () => {
      await expect(svc.readFile(OTHER_WS, 'repo-1', 'docs/a.md')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('writeFile', () => {
    it('AC-10: writes once and returns the new content with a new hash', async () => {
      const saved = await svc.writeFile(WS, 'repo-1', {
        path: 'docs/a.md',
        content: 'new ✓',
        base_hash: sha('# A\n'),
      });
      expect(store.writes).toEqual([{ abs: 'docs/a.md', content: 'new ✓' }]);
      expect(saved.content).toBe('new ✓');
      expect(saved.content_hash).toBe(sha('new ✓'));
      expect(saved.content_hash).not.toBe(sha('# A\n'));
    });

    it('AC-13: a stale base_hash → ConflictError and nothing written', async () => {
      const err = await svc
        .writeFile(WS, 'repo-1', { path: 'docs/a.md', content: 'x', base_hash: sha('old') })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err).toMatchObject({ statusCode: 409, code: 'conflict', message: 'content changed since loaded' });
      expect(store.writes).toEqual([]);
    });

    it('AC-11: an unlisted path → 404 before any read or write', async () => {
      await expect(
        svc.writeFile(WS, 'repo-1', { path: 'src/x.md', content: 'x', base_hash: 'h' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(store.writes).toEqual([]);
    });

    it('NFR-2: another workspace → NotFoundError, nothing written', async () => {
      await expect(
        svc.writeFile(OTHER_WS, 'repo-1', { path: 'docs/a.md', content: 'x', base_hash: sha('# A\n') }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(store.writes).toEqual([]);
    });
  });
});
