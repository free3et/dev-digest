import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class ExportsRepository {
  constructor(private db: Db) {}

  findingsQuery() {
    return this.db
      .select({
        id: t.findings.id,
        runId: t.findings.runId,
        path: t.findings.path,
        line: t.findings.line,
        severity: t.findings.severity,
        title: t.findings.title,
      })
      .from(t.findings)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.findings.runId));
  }

  async recordExport(
    workspaceId: string,
    pullId: string,
    findingIds: string[],
    format: 'csv' | 'sarif',
  ) {
    return this.db.transaction(async (tx) => {
      const [exp] = await tx
        .insert(t.findingExports)
        .values({ workspaceId, pullId, format, count: findingIds.length })
        .returning();
      if (findingIds.length > 0) {
        await tx
          .insert(t.findingExportItems)
          .values(findingIds.map((findingId) => ({ exportId: exp!.id, findingId })));
      }
      return exp!;
    });
  }
}
