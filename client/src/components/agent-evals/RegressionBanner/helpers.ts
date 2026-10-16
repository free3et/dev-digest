import type { EvalSuiteRun } from "@devdigest/shared";
import { metricDelta, pointDelta } from "@/lib/format";
import { isFinished, sameCaseSet } from "../helpers";

export type BannerMetric = "recall" | "precision" | "citation";

/** Order of mention in the sentences; the field name on `EvalSuiteRun` follows. */
const METRICS = [
  ["recall", "recall"],
  ["precision", "precision"],
  ["citation", "citation_accuracy"],
] as const;

export interface BannerDip {
  metric: BannerMetric;
  points: number;
  /** A non-zero dip that rounds to 0 points (shown as "<1"). */
  belowOne: boolean;
}

export interface RegressionBannerData {
  /** `agent_version` of the newest finished run. */
  version: number;
  dips: BannerDip[];
  ups: BannerMetric[];
  differentCaseSets: boolean;
}

type RunLike = Pick<
  EvalSuiteRun,
  "status" | "agent_version" | "case_ids" | "recall" | "precision" | "citation_accuracy"
>;

/**
 * Spec D AC-13..16 over the history list (newest first). Compares the two
 * newest finished runs (`running` / `failed` skipped). Null unless recall or
 * precision dipped; citation is named when it dipped or went up, but never
 * triggers the banner. Deltas use the same 6 dp rounding and null rule as the
 * dashboard's `drop` (`metricDelta` + `pointDelta`).
 */
export function regressionBanner(runs: readonly RunLike[]): RegressionBannerData | null {
  const finished = runs.filter(isFinished);
  const newest = finished[0];
  const prev = finished[1];
  if (!newest || !prev) return null;

  const dips: BannerDip[] = [];
  const ups: BannerMetric[] = [];
  for (const [metric, field] of METRICS) {
    const d = pointDelta(metricDelta(prev[field], newest[field]));
    if (!d) continue;
    if (d.direction === "down") dips.push({ metric, points: d.points, belowOne: d.belowOne });
    else if (d.direction === "up") ups.push(metric);
  }
  if (!dips.some((d) => d.metric === "recall" || d.metric === "precision")) return null;

  return {
    version: newest.agent_version,
    dips,
    ups,
    differentCaseSets: !sameCaseSet(newest.case_ids, prev.case_ids),
  };
}
