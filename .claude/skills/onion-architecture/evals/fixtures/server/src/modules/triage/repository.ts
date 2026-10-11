import { eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { TriageStatus } from './constants.js';

export class TriageRepository {
  constructor(private db: Db) {}

  async markTriaged(ids: string[], status: TriageStatus, tx?: DbTx) {
    if (ids.length === 0) return;
    await (tx ?? this.db)
      .update(t.findings)
      .set({ triageStatus: status, triagedAt: new Date() })
      .where(inArray(t.findings.id, ids));
  }

  async insertAudit(
    entry: { workspaceId: string; actor: string; count: number; status: TriageStatus },
    tx?: DbTx,
  ) {
    await (tx ?? this.db).insert(t.triageAudit).values(entry);
  }

  async bumpCounters(workspaceId: string, count: number, tx?: DbTx) {
    await (tx ?? this.db)
      .update(t.workspaceCounters)
      .set({ triaged: sql`${t.workspaceCounters.triaged} + ${count}` })
      .where(eq(t.workspaceCounters.workspaceId, workspaceId));
  }
}
