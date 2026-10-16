import type { EvalSuiteRun } from "@devdigest/shared";
import { isFinished, metricPoints, type RunMetricField } from "@/components/agent-evals/helpers";
import { metricDelta, pointDelta, type PointDelta } from "@/lib/format";

type Run = Pick<EvalSuiteRun, "status"> & Pick<EvalSuiteRun, RunMetricField>;

export interface MetricCardView {
  /** Newest finished run's stored 0..1 value; null without one or when it is null. */
  value: number | null;
  /** newest − previous finished run; null without a previous run or with a null side. */
  delta: PointDelta | null;
  /** Non-null values over finished runs, oldest first (sparkline). */
  points: number[];
}

/**
 * One card's numbers from the loaded history, newest first (Spec F AC-13..15).
 * Running and failed runs are skipped, so a run in between never becomes
 * "previous". The delta comes from stored values, not rounded percents.
 */
export function metricCardView(runs: readonly Run[], field: RunMetricField): MetricCardView {
  const finished = runs.filter(isFinished);
  const newest = finished[0];
  const previous = finished[1];
  const value = newest?.[field] ?? null;
  return {
    value,
    delta: value === null ? null : pointDelta(metricDelta(previous?.[field] ?? null, value)),
    points: metricPoints(runs, field),
  };
}
