import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class DigestsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string) {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async insertDigest(input: {
    workspaceId: string;
    repoId: string;
    periodStart: Date;
    periodEnd: Date;
    prCount: number;
  }) {
    const [row] = await this.db.insert(t.weeklyDigests).values(input).returning();
    return row!;
  }

  async insertDigestItems(items: Array<typeof t.weeklyDigestItems.$inferInsert>) {
    if (items.length === 0) return;
    await this.db.insert(t.weeklyDigestItems).values(items);
  }

  async markPullsDigested(repoId: string, numbers: number[], digestId: string) {
    if (numbers.length === 0) return;
    await this.db
      .update(t.pullRequests)
      .set({ digestId })
      .where(and(eq(t.pullRequests.repoId, repoId), inArray(t.pullRequests.number, numbers)));
  }
}
