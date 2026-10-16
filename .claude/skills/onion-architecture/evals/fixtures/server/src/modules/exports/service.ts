import { and, eq, gte, inArray } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { ExportsRepository } from './repository.js';
import { toCsv, toSarif } from './helpers.js';

export interface ExportRequest {
  pullId: string;
  format: 'csv' | 'sarif';
  minSeverity?: 'suggestion' | 'warning' | 'critical';
}

const SEVERITY_ORDER = { suggestion: 0, warning: 1, critical: 2 } as const;

export class ExportsService {
  constructor(
    private repo: ExportsRepository,
    private container: Container,
  ) {}

  static fromContainer(container: Container): ExportsService {
    return new ExportsService(new ExportsRepository(container.db), container);
  }

  async exportFindings(workspaceId: string, req: ExportRequest) {
    const allowed = (Object.keys(SEVERITY_ORDER) as Array<keyof typeof SEVERITY_ORDER>).filter(
      (s) => SEVERITY_ORDER[s] >= SEVERITY_ORDER[req.minSeverity ?? 'suggestion'],
    );

    const rows = await this.repo
      .findingsQuery()
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.pullId, req.pullId),
          inArray(t.findings.severity, allowed),
          gte(t.findings.line, 1),
        ),
      );

    const findingIds = rows.map((r) => r.id);
    const exp = await this.repo.recordExport(workspaceId, req.pullId, findingIds, req.format);
    await this.container.reviewRepo.markFindingsExported(findingIds, exp.id);

    return req.format === 'csv' ? toCsv(rows) : toSarif(rows);
  }
}
