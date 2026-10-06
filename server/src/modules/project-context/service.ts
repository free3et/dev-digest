import type { ContextDocList, ContextDocWrite, SpecFile } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { CONFLICT_MESSAGE, NOT_LISTED_MESSAGE } from './constants.js';
import { byPath, contentHash, isMissingDirError, toFile, toListItem } from './helpers.js';
import { ProjectContextRepository, type ContextRepo } from './repository.js';

export class ProjectContextService {
  constructor(
    private container: Container,
    private repo: Pick<ProjectContextRepository, 'getRepoForWorkspace'> = new ProjectContextRepository(
      container.db,
    ),
  ) {}

  private get store() {
    return this.container.contextDocs;
  }

  private get roots() {
    return this.container.config.contextRoots;
  }

  private async getRepo(workspaceId: string, repoId: string): Promise<ContextRepo> {
    const repo = await this.repo.getRepoForWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  async list(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const repo = await this.getRepo(workspaceId, repoId);
    const refreshed_at = new Date().toISOString();
    if (!repo.clonePath) return { documents: [], refreshed_at, cloned: false };
    try {
      const entries = await this.store.list(repo.clonePath, this.roots);
      return { documents: entries.map(toListItem).sort(byPath), refreshed_at, cloned: true };
    } catch (err) {
      if (isMissingDirError(err)) return { documents: [], refreshed_at, cloned: false };
      throw err;
    }
  }

  /** Resolve a path to an absolute file or throw the one 404 every path rule shares. */
  private async resolveOrThrow(workspaceId: string, repoId: string, path: string) {
    const repo = await this.getRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new NotFoundError(NOT_LISTED_MESSAGE);
    const abs = await this.store.resolve(repo.clonePath, path, this.roots);
    if (!abs) throw new NotFoundError(NOT_LISTED_MESSAGE);
    return abs;
  }

  async readFile(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    const abs = await this.resolveOrThrow(workspaceId, repoId, path);
    return toFile(path, await this.store.read(abs));
  }

  async writeFile(workspaceId: string, repoId: string, body: ContextDocWrite): Promise<SpecFile> {
    const abs = await this.resolveOrThrow(workspaceId, repoId, body.path);
    const current = await this.store.read(abs);
    if (contentHash(current) !== body.base_hash) throw new ConflictError(CONFLICT_MESSAGE);
    await this.store.writeAtomic(abs, body.content);
    return toFile(body.path, await this.store.read(abs));
  }
}
