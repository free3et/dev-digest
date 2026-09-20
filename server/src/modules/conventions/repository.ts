import { and, asc, eq } from 'drizzle-orm';
import type { ConventionCategory } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
import type { GroundedCandidate } from './grounding.js';

export type { ConventionRow };

export interface RepoInfo {
  id: string;
  owner: string;
  name: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }

  async list(workspaceId: string, repoId: string, onlyAccepted = false): Promise<ConventionRow[]> {
    const where = [eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)];
    if (onlyAccepted) where.push(eq(t.conventions.accepted, true));
    return this.db
      .select()
      .from(t.conventions)
      .where(and(...where))
      .orderBy(asc(t.conventions.category), asc(t.conventions.rule));
  }

  /** Drop every `accepted = false` row of the repo and insert the new candidates. Accepted rows are never touched. */
  async replacePending(workspaceId: string, repoId: string, items: GroundedCandidate[]): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.accepted, false),
          ),
        );
      if (items.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(
          items.map((c) => ({
            workspaceId,
            repoId,
            rule: c.rule,
            category: c.category,
            confidence: c.confidence,
            evidencePath: c.evidence_path,
            evidenceSnippet: c.evidence_snippet,
            evidenceLine: c.evidence_line,
            accepted: false,
          })),
        )
        .returning();
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { accepted?: boolean; rule?: string; category?: ConventionCategory },
  ): Promise<ConventionRow | undefined> {
    const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const where = and(eq(t.conventions.id, id), eq(t.conventions.workspaceId, workspaceId));
    if (Object.keys(set).length === 0) {
      const [row] = await this.db.select().from(t.conventions).where(where);
      return row;
    }
    const [row] = await this.db.update(t.conventions).set(set).where(where).returning();
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.id, id), eq(t.conventions.workspaceId, workspaceId)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
