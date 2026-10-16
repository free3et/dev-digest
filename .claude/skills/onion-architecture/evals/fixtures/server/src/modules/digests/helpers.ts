import type { WeeklyDigest } from '@devdigest/shared';

export interface MergedPull {
  id: string;
  number: number;
  title: string;
  author: string;
  mergedAt: Date;
}

export interface DigestRow {
  id: string;
  repoId: string;
  periodStart: Date;
  periodEnd: Date;
  prCount: number;
  createdAt: Date;
}

export function toDigestItemRows(digestId: string, merged: MergedPull[]) {
  return merged.map((p, position) => ({
    digestId,
    position,
    pullNumber: p.number,
    title: p.title,
    author: p.author,
  }));
}

export function toDigestDto(digest: DigestRow, merged: MergedPull[]): WeeklyDigest {
  return {
    id: digest.id,
    repo_id: digest.repoId,
    period_start: digest.periodStart.toISOString(),
    period_end: digest.periodEnd.toISOString(),
    pr_count: digest.prCount,
    created_at: digest.createdAt.toISOString(),
    items: merged.map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author,
      merged_at: p.mergedAt.toISOString(),
    })),
  };
}
