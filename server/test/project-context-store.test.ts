/**
 * FsContextDocStore (ring 3 adapter) — AC-1, AC-10, AC-11, AC-12.
 * Temp-dir fixtures, no DB, no network (precedent: indexer-walk.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FsContextDocStore } from '../src/adapters/context-docs/fs-store.js';

const ROOTS = ['specs', 'docs', 'insights'];

describe('FsContextDocStore', () => {
  let base: string;
  let root: string;
  let outside: string;

  const put = async (dir: string, rel: string, text: string) => {
    const full = join(dir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, text);
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'ctx-store-'));
    root = join(base, 'clone');
    outside = join(base, 'outside');
    await mkdir(root);
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  describe('list (AC-1)', () => {
    it('returns regular .md files under the roots; prunes excluded dirs, symlinks and non-roots', async () => {
      await put(root, 'docs/a.md', '# a');
      await put(root, 'specs/b.md', 'bb');
      await put(root, 'docs/specs/c.md', 'c');
      await put(root, '.devdigest/specs/d.md', 'd');
      await put(root, 'docs/notes.txt', 'not md');
      await put(root, 'src/readme.md', 'no root');
      await put(root, 'node_modules/docs/x.md', 'x');
      await put(root, 'vendor/docs/y.md', 'y');
      await put(root, '.git/docs/g.md', 'g');
      await put(root, 'docs/node_modules/n.md', 'n');
      await put(outside, 'secret.md', 'SECRET');
      await put(outside, 'dir/z.md', 'Z');
      await symlink(join(outside, 'secret.md'), join(root, 'docs/link.md'));
      await symlink(join(outside, 'dir'), join(root, 'docs/out'));

      const entries = await new FsContextDocStore().list(root, ROOTS);

      expect(entries.map((e) => e.path).sort()).toEqual([
        '.devdigest/specs/d.md',
        'docs/a.md',
        'docs/specs/c.md',
        'specs/b.md',
      ]);
      const b = entries.find((e) => e.path === 'specs/b.md')!;
      expect(b.text).toBe('bb');
      expect(b.size).toBe(2);
      expect(typeof b.mtime).toBe('number');
    });

    it('reports size in bytes and the decoded text for non-ASCII content', async () => {
      await put(root, 'docs/u.md', '日本語€😀');
      const [e] = await new FsContextDocStore().list(root, ROOTS);
      expect(e!.size).toBe(16);
      expect(e!.text).toBe('日本語€😀');
    });

    it('honours a subset of roots', async () => {
      await put(root, 'docs/a.md', 'a');
      await put(root, 'specs/b.md', 'b');
      const entries = await new FsContextDocStore().list(root, ['docs']);
      expect(entries.map((e) => e.path)).toEqual(['docs/a.md']);
    });
  });

  describe('resolve (AC-11)', () => {
    beforeEach(async () => {
      await put(root, 'docs/a.md', 'a');
      await put(root, 'src/readme.md', 'no root');
      await put(root, '.git/config', '[core]');
      await put(root, 'node_modules/docs/x.md', 'x');
      await put(outside, 'secret.md', 'SECRET');
      await put(outside, 'dir/z.md', 'Z');
      await put(outside, 'docs/q.md', 'Q');
      await symlink(join(outside, 'secret.md'), join(root, 'docs/link.md'));
      await symlink(join(outside, 'dir'), join(root, 'docs/out'));
      await symlink(outside, join(root, 'linked')); // ancestor symlink → outside/docs/q.md
    });

    it('returns the absolute path of a listed regular file', async () => {
      const abs = await new FsContextDocStore().resolve(root, 'docs/a.md', ROOTS);
      expect(abs).not.toBeNull();
      expect(await realpath(abs!)).toBe(await realpath(join(root, 'docs/a.md')));
    });

    it('size() returns the byte length without reading the content', async () => {
      const store = new FsContextDocStore();
      const abs = (await store.resolve(root, 'docs/a.md', ROOTS))!;
      expect(await store.size(abs)).toBe((await store.read(abs)).length);
    });

    it.each([
      ['not under a root', 'src/readme.md'],
      ['missing file', 'docs/missing.md'],
      ['a directory', 'docs'],
      ['absolute', '/etc/passwd'],
      ['dot-dot', 'docs/../src/readme.md'],
      ['dot-dot out of the clone', '../outside/secret.md'],
      ['backslash', 'docs\\a.md'],
      ['NUL byte', 'docs/a.md\u0000'],
      ['inside .git', '.git/config'],
      ['excluded node_modules', 'node_modules/docs/x.md'],
      ['symlink leaf', 'docs/link.md'],
      ['file in a symlinked folder', 'docs/out/z.md'],
      ['symlinked ancestor resolving outside the root', 'linked/docs/q.md'],
    ])('returns null for %s', async (_kind, path) => {
      expect(await new FsContextDocStore().resolve(root, path, ROOTS)).toBeNull();
    });

    it('returns null for a real path outside the root (root is a sub-folder of the real tree)', async () => {
      // Resolving relative to a deeper "root" must not reach a sibling of it.
      const sub = join(root, 'docs');
      expect(await new FsContextDocStore().resolve(sub, '../docs/a.md', ROOTS)).toBeNull();
    });
  });

  describe('read + writeAtomic', () => {
    beforeEach(async () => {
      await put(root, 'docs/a.md', 'original');
    });
    const target = () => join(root, 'docs/a.md');

    it('AC-10: replaces the content, byte for byte, with no temp file left', async () => {
      const store = new FsContextDocStore();
      const next = '# 新しい€😀\n';
      await store.writeAtomic(target(), next);

      expect(await readFile(target())).toEqual(Buffer.from(next, 'utf8'));
      expect(await store.read(target())).toEqual(Buffer.from(next, 'utf8'));
      expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
    });

    it('creates the temp file exclusively in the target folder', async () => {
      const writeFileSpy = vi.fn(writeFile);
      await new FsContextDocStore({ writeFile: writeFileSpy }).writeAtomic(target(), 'x');

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      const [tmpPath, , opts] = writeFileSpy.mock.calls[0] as unknown as [string, string, { flag?: string }];
      expect(dirname(tmpPath)).toBe(dirname(target()));
      expect(tmpPath).not.toBe(target());
      expect(opts.flag).toBe('wx');
    });

    it('AC-12: a failing rename leaves the original bytes and no *.tmp, and rethrows', async () => {
      const rename = vi.fn(async () => {
        throw new Error('rename boom');
      });
      const store = new FsContextDocStore({ rename });

      await expect(store.writeAtomic(target(), 'NEW CONTENT')).rejects.toThrow('rename boom');

      expect(rename).toHaveBeenCalledTimes(1);
      expect(await readFile(target(), 'utf8')).toBe('original');
      expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
    });

    it('AC-12: a write that fails after the temp file was created cleans it up', async () => {
      const failingWrite = vi.fn(async (path: string, data: string) => {
        await writeFile(path, data.slice(0, 3)); // partial temp content lands on disk
        throw new Error('disk full');
      });
      const rename = vi.fn();
      const store = new FsContextDocStore({ writeFile: failingWrite as never, rename: rename as never });

      await expect(store.writeAtomic(target(), 'NEW CONTENT')).rejects.toThrow('disk full');

      expect(rename).not.toHaveBeenCalled();
      expect(await readFile(target(), 'utf8')).toBe('original');
      expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
    });

    it('AC-12: a failing cleanup does not mask the original error', async () => {
      const unlink = vi.fn(async () => {
        throw new Error('unlink boom');
      });
      const rename = vi.fn(async () => {
        throw new Error('rename boom');
      });
      const store = new FsContextDocStore({ rename, unlink });

      await expect(store.writeAtomic(target(), 'x')).rejects.toThrow('rename boom');
      expect(unlink).toHaveBeenCalled();
      expect(await readFile(target(), 'utf8')).toBe('original');
    });
  });
});
