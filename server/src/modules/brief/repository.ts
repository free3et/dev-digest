import { and, eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * brief data-access layer. The ONLY file in this module that touches the DB.
 * Reads `pull_requests` + `repos` (workspace-scoped, the tenancy guard) and
 * reads/writes `pr_brief` (`pr_id` primary key + one `json` document).
 * Intent, files and reviews are read through `container.reviewRepo`.
 */
export interface PullScope {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  owner: string;
  name: string;
}

export interface BriefRepo {
  getPullScope(workspaceId: string, prId: string): Promise<PullScope | undefined>;
  getBrief(prId: string): Promise<PrBrief | undefined>;
  upsertBrief(prId: string, brief: PrBrief): Promise<void>;
}

export class BriefRepository implements BriefRepo {
  constructor(private db: Db) {}

  async getPullScope(workspaceId: string, prId: string): Promise<PullScope | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** The stored brief; a row that no longer parses is treated as absent. */
  async getBrief(prId: string): Promise<PrBrief | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    if (!row) return undefined;
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? parsed.data : undefined;
  }

  /** One row per PR, overwritten on regenerate. */
  async upsertBrief(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
