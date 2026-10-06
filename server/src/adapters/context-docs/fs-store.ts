import { randomBytes } from 'node:crypto';
import { lstat, readdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import type { ContextDocEntry, ContextDocStore } from '@devdigest/shared';
import { EXCLUDED_SEGMENTS, isCandidatePath } from './rules.js';

/** Injectable fs seams so tests can fail one step of the atomic write. */
export interface FsContextDocStoreOps {
  rename?: typeof rename;
  writeFile?: typeof writeFile;
  unlink?: typeof unlink;
}

/**
 * Clone working-tree access for Project Context docs (ring 3).
 * Never follows symlinks: directories are walked with `readdir` dirents,
 * `resolve` lstat-checks every ancestor and the leaf and then proves the real
 * path stays inside the real clone root.
 */
export class FsContextDocStore implements ContextDocStore {
  private readonly rename: typeof rename;
  private readonly writeFile: typeof writeFile;
  private readonly unlink: typeof unlink;

  constructor(ops: FsContextDocStoreOps = {}) {
    this.rename = ops.rename ?? rename;
    this.writeFile = ops.writeFile ?? writeFile;
    this.unlink = ops.unlink ?? unlink;
  }

  async list(root: string, roots: string[]): Promise<ContextDocEntry[]> {
    const out: ContextDocEntry[] = [];
    // Iterative walk; `rel` is '' for the root. A missing root throws ENOENT to the caller.
    const stack: string[] = [''];
    while (stack.length > 0) {
      const rel = stack.pop()!;
      const dirents = await readdir(rel ? join(root, rel) : root, { withFileTypes: true });
      for (const d of dirents) {
        if (d.isSymbolicLink()) continue;
        const childRel = rel ? `${rel}/${d.name}` : d.name;
        if (d.isDirectory()) {
          if (!EXCLUDED_SEGMENTS.includes(d.name)) stack.push(childRel);
        } else if (d.isFile() && isCandidatePath(childRel, roots)) {
          const abs = join(root, childRel);
          const [bytes, st] = await Promise.all([readFile(abs), lstat(abs)]);
          out.push({ path: childRel, size: bytes.length, mtime: st.mtimeMs, text: bytes.toString('utf8') });
        }
      }
    }
    return out;
  }

  async resolve(root: string, path: string, roots: string[]): Promise<string | null> {
    if (!isCandidatePath(path, roots)) return null;
    try {
      const rootReal = await realpath(root);
      const segments = path.split('/');
      let cur = root;
      for (const seg of segments.slice(0, -1)) {
        cur = join(cur, seg);
        const st = await lstat(cur);
        if (!st.isDirectory()) return null; // symlinks report isDirectory() === false
      }
      const leaf = join(cur, segments[segments.length - 1]!);
      const st = await lstat(leaf);
      if (!st.isFile()) return null;
      const real = await realpath(leaf);
      return real.startsWith(rootReal + sep) ? real : null;
    } catch {
      return null;
    }
  }

  read(abs: string): Promise<Buffer> {
    return readFile(abs);
  }

  async writeAtomic(abs: string, content: string): Promise<void> {
    const tmp = join(dirname(abs), `.${basename(abs)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      let mode: number | undefined;
      try {
        mode = (await lstat(abs)).mode & 0o777;
      } catch {
        mode = undefined;
      }
      await this.writeFile(tmp, content, { flag: 'wx', ...(mode === undefined ? {} : { mode }) });
      await this.rename(tmp, abs);
    } catch (err) {
      try {
        await this.unlink(tmp);
      } catch {
        // best-effort cleanup must not mask the original error
      }
      throw err;
    }
  }
}
