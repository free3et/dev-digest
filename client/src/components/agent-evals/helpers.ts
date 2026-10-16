import type { EvalSuiteRun } from "@devdigest/shared";

/** A finished run is `done` or `partial` (Spec B AC-5, Spec D). `running` and `failed` are not. */
export function isFinished(run: Pick<EvalSuiteRun, "status">): boolean {
  return run.status === "done" || run.status === "partial";
}

/** True when both runs ran over exactly the same set of case ids. */
export function sameCaseSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Metric fields of a suite run that the page charts. */
export type RunMetricField = "recall" | "precision" | "citation_accuracy";

/** Finished runs, oldest first. The server sends the history newest first (Spec F F2). */
export function finishedOldestFirst<T extends Pick<EvalSuiteRun, "status">>(runs: readonly T[]): T[] {
  return runs.filter(isFinished).reverse();
}

/** The non-null values of one metric over the finished runs, oldest first (card sparklines, AC-14). */
export function metricPoints(
  runs: readonly (Pick<EvalSuiteRun, "status"> & Pick<EvalSuiteRun, RunMetricField>)[],
  field: RunMetricField,
): number[] {
  const points: number[] = [];
  for (const run of finishedOldestFirst(runs)) {
    const v = run[field];
    if (v != null && !Number.isNaN(v)) points.push(v);
  }
  return points;
}
