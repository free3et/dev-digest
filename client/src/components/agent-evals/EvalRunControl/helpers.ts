import type { EvalSuiteRun } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

export type RefusalKey =
  | "eval_run_in_progress"
  | "no_cases"
  | "too_many_cases"
  | "not_found"
  | "rate_limited"
  | "network_error"
  | "unknown";

const BY_CODE: readonly RefusalKey[] = ["eval_run_in_progress", "no_cases", "too_many_cases", "not_found"];

/**
 * i18n key (under `evalsTab.refusals`) for a refused or failed run request.
 * 429 is matched by status (the rate limiter's code is not ours); 409/422/404
 * by the server's code from the refusal table (Spec A R-2).
 */
export function refusalKey(err: unknown): RefusalKey {
  if (!(err instanceof ApiError)) return "network_error";
  if (err.status === 0) return "network_error";
  if (err.status === 429) return "rate_limited";
  return BY_CODE.find((k) => k === err.code) ?? "unknown";
}

/** Newest run still `running`, found on load from the history. */
export function runningRun(runs: readonly EvalSuiteRun[] | undefined): EvalSuiteRun | undefined {
  return runs?.find((r) => r.status === "running");
}

/**
 * Live progress numerator. `cases_completed` counts non-errored cases only, so
 * errored ones are added; otherwise the counter would stall on a failing case.
 */
export function casesDone(run: Pick<EvalSuiteRun, "cases_completed" | "cases_errored">): number {
  return run.cases_completed + run.cases_errored;
}
