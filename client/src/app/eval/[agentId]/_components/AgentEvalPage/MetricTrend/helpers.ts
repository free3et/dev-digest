import type { EvalSuiteRun } from "@devdigest/shared";
import { finishedOldestFirst } from "@/components/agent-evals/helpers";
import { toPercent } from "@/lib/format";

export type TrendKey = "recall" | "precision" | "citation";

/** One plotted point: a finished run, percents whole, null kept as null (gap, AC-17). */
export interface TrendRow {
  /** Position in the plotted list. The x key, because two runs can share a version (EC-16). */
  idx: number;
  id: string;
  version: number;
  label: string;
  ran_at: string;
  recall: number | null;
  precision: number | null;
  citation: number | null;
}

export const TREND_KEYS: readonly TrendKey[] = ["recall", "precision", "citation"];

/** Finished runs, oldest first, as chart rows (Spec F AC-16). Never maps null to 0. */
export function trendRows(runs: readonly EvalSuiteRun[]): TrendRow[] {
  return finishedOldestFirst(runs).map((r, idx) => ({
    idx,
    id: r.id,
    version: r.agent_version,
    label: `v${r.agent_version}`,
    ran_at: r.ran_at,
    recall: toPercent(r.recall),
    precision: toPercent(r.precision),
    citation: toPercent(r.citation_accuracy),
  }));
}

/** False when the metric is null in every plotted run: it draws no line, the legend says "(no data)" (AC-17). */
export function seriesHasData(rows: readonly TrendRow[], key: TrendKey): boolean {
  return rows.some((r) => r[key] !== null);
}

export interface TooltipContent {
  version: number;
  ranAt: string;
  metrics: { key: TrendKey; percent: number | null }[];
}

/** What the hover tooltip shows for one point (AC-19). */
export function tooltipContent(row: TrendRow): TooltipContent {
  return {
    version: row.version,
    ranAt: row.ran_at,
    metrics: TREND_KEYS.map((key) => ({ key, percent: row[key] })),
  };
}
