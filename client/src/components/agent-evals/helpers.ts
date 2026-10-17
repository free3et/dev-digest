import type { EvalSuiteRun } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import type { EvalHost, EvalOwner } from "@/lib/hooks/eval";

/** Props of an owner-aware shared part: the legacy `agentId`, or an explicit owner (Spec G2 D2). */
export type OwnerProps = { agentId: string; owner?: undefined } | { owner: EvalOwner; agentId?: undefined };

/** The owner a shared part works for; `agentId` keeps every agent call site unchanged. */
export function resolveOwner(props: OwnerProps): EvalOwner {
  return props.owner ?? { kind: "agent", id: props.agentId };
}

const SKILL_REFUSAL_CODES = [
  "host_required",
  "host_not_found",
  "host_not_allowed",
  "not_agent_case",
  "eval_run_in_progress",
  "no_cases",
  "too_many_cases",
  "invalid_diff",
  "not_found",
] as const;

export type SkillRefusalKey = (typeof SKILL_REFUSAL_CODES)[number] | "rate_limited" | "network_error" | "unknown";

/** i18n key under `skillEvals.refusals` for a refused or failed skill request (G1 R-G1..R-G3). */
export function skillRefusalKey(err: unknown): SkillRefusalKey {
  if (!(err instanceof ApiError)) return "network_error";
  if (err.status === 0) return "network_error";
  if (err.status === 429) return "rate_limited";
  return SKILL_REFUSAL_CODES.find((k) => k === err.code) ?? "unknown";
}

/** The version a run is shown under: the skill's for a skill owner, else the agent's. */
export function runVersion(run: Pick<EvalSuiteRun, "agent_version" | "skill_version">, kind: EvalOwner["kind"]): number {
  return kind === "skill" ? (run.skill_version ?? run.agent_version) : run.agent_version;
}

export type HostLabel =
  | { kind: "known"; name: string; version: number }
  | { kind: "deleted" }
  | { kind: "loading" };

/** What the "Host" cell shows: undefined `hosts` = still loading, a missing id = deleted agent. */
export function hostLabel(
  hosts: ReadonlyMap<string, EvalHost> | undefined,
  agentId: string,
  version: number,
): HostLabel {
  if (!hosts) return { kind: "loading" };
  const host = hosts.get(agentId);
  return host ? { kind: "known", name: host.name, version } : { kind: "deleted" };
}

/** A finished run is `done` or `partial` (Spec B AC-5, Spec D). `running` and `failed` are not. */
export function isFinished(run: Pick<EvalSuiteRun, "status">): boolean {
  return run.status === "done" || run.status === "partial";
}

/**
 * The owner's reference suite: the newest `done` or `partial` one (as the
 * dashboard's `latest`). The history is newest first. Undefined when none
 * finished, e.g. only `failed` or `running` suites exist (Spec G3 AC-1).
 */
export function referenceSuite<T extends Pick<EvalSuiteRun, "status">>(runs: readonly T[] | undefined): T | undefined {
  return runs?.find(isFinished);
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
