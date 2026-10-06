import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface ContextRepo {
  id: string;
  clonePath: string | null;
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped lookup: a repo of another workspace is `undefined`. */
  async getRepoForWorkspace(workspaceId: string, repoId: string): Promise<ContextRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }
}
