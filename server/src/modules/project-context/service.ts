import type { AgentContextDocs, ContextDocList, SkillContextDocs, ContextDocWrite, SpecFile } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { CONFLICT_MESSAGE, NOT_LISTED_MESSAGE } from './constants.js';
import {
  assertAttachable,
  byPath,
  contentHash,
  dedupeInherited,
  isMissingDirError,
  toAttachment,
  toDocListMap,
  toFile,
  toListItem,
  type DocListMap,
} from './helpers.js';
import { ProjectContextRepository, type ContextRepo } from './repository.js';

export class ProjectContextService {
  constructor(
    private container: Container,
    private repo: Pick<
      ProjectContextRepository,
      | 'getRepoForWorkspace'
      | 'usedByAgentsByPath'
      | 'getAgentForWorkspace'
      | 'agentDocs'
      | 'inheritedDocs'
      | 'replaceAgentDocs'
      | 'getSkillForWorkspace'
      | 'skillDocs'
      | 'replaceSkillDocs'
      | 'skillUsedByAgents'
    > = new ProjectContextRepository(container.db),
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
      const used = await this.repo.usedByAgentsByPath(workspaceId, repoId);
      const documents = entries.map((e) => toListItem(e, used.get(e.path) ?? 0)).sort(byPath);
      return { documents, refreshed_at, cloned: true };
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
    const bytes = await this.store.read(abs);
    const used = await this.repo.usedByAgentsByPath(workspaceId, repoId);
    return toFile(path, bytes, used.get(path) ?? 0);
  }

  async writeFile(workspaceId: string, repoId: string, body: ContextDocWrite): Promise<SpecFile> {
    const abs = await this.resolveOrThrow(workspaceId, repoId, body.path);
    const current = await this.store.read(abs);
    if (contentHash(current) !== body.base_hash) throw new ConflictError(CONFLICT_MESSAGE);
    await this.store.writeAtomic(abs, body.content);
    const bytes = await this.store.read(abs);
    const used = await this.repo.usedByAgentsByPath(workspaceId, repoId);
    return toFile(body.path, bytes, used.get(body.path) ?? 0);
  }

  /** The repo's current document list as path -> size/tokens; no clone or missing dir -> empty. */
  private async docMap(repo: ContextRepo): Promise<DocListMap> {
    if (!repo.clonePath) return new Map();
    try {
      const entries = await this.store.list(repo.clonePath, this.roots);
      return toDocListMap(entries.map((e) => toListItem(e, 0)));
    } catch (err) {
      if (isMissingDirError(err)) return new Map();
      throw err;
    }
  }

  private async agentView(agentId: string, repo: ContextRepo, docs: DocListMap): Promise<AgentContextDocs> {
    const r = this.repo;
    const [ownPaths, inherited] = await Promise.all([r.agentDocs(agentId, repo.id), r.inheritedDocs(agentId, repo.id)]);
    return {
      repo_id: repo.id,
      own: ownPaths.map((p) => toAttachment(p, docs)),
      inherited: dedupeInherited(ownPaths, inherited, docs),
    };
  }

  async getAgentDocs(workspaceId: string, agentId: string, repoId: string): Promise<AgentContextDocs> {
    const r = this.repo;
    if (!(await r.getAgentForWorkspace(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const repo = await this.getRepo(workspaceId, repoId);
    return this.agentView(agentId, repo, await this.docMap(repo));
  }

  async putAgentDocs(workspaceId: string, agentId: string, repoId: string, paths: string[]): Promise<AgentContextDocs> {
    const r = this.repo;
    if (!(await r.getAgentForWorkspace(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const repo = await this.getRepo(workspaceId, repoId);
    const docs = await this.docMap(repo);
    assertAttachable(paths, docs, await r.agentDocs(agentId, repo.id));
    await r.replaceAgentDocs(agentId, repo.id, paths);
    return this.agentView(agentId, repo, docs);
  }

  private async skillView(skillId: string, repo: ContextRepo, docs: DocListMap): Promise<SkillContextDocs> {
    const r = this.repo;
    const [paths, used] = await Promise.all([r.skillDocs(skillId, repo.id), r.skillUsedByAgents(skillId)]);
    return { repo_id: repo.id, docs: paths.map((p) => toAttachment(p, docs)), used_by_agents: used };
  }

  async getSkillDocs(workspaceId: string, skillId: string, repoId: string): Promise<SkillContextDocs> {
    const r = this.repo;
    if (!(await r.getSkillForWorkspace(workspaceId, skillId))) throw new NotFoundError('Skill not found');
    const repo = await this.getRepo(workspaceId, repoId);
    return this.skillView(skillId, repo, await this.docMap(repo));
  }

  async putSkillDocs(workspaceId: string, skillId: string, repoId: string, paths: string[]): Promise<SkillContextDocs> {
    const r = this.repo;
    if (!(await r.getSkillForWorkspace(workspaceId, skillId))) throw new NotFoundError('Skill not found');
    const repo = await this.getRepo(workspaceId, repoId);
    const docs = await this.docMap(repo);
    assertAttachable(paths, docs, await r.skillDocs(skillId, repo.id));
    await r.replaceSkillDocs(skillId, repo.id, paths);
    return this.skillView(skillId, repo, docs);
  }
}
