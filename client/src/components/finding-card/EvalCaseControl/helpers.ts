import type { EvalCase, EvalExpectationKind, FindingRecord } from "@devdigest/shared";

export type EvalControlState =
  | { kind: "none" }
  | { kind: "button"; expectation: EvalExpectationKind }
  | { kind: "link"; href: string };

const NONE: EvalControlState = { kind: "none" };

/** Where the "In eval set" link leads: the agent's Evals tab. */
export function evalsTabHref(agentId: string): string {
  return `/agents/${agentId}?tab=evals`;
}

/**
 * Which eval control a finding card shows (Spec A AC-5). Nothing without an
 * agent or a decision; a link when a case already has this finding as its
 * source; otherwise a button whose expectation follows the decision
 * (accepted → must_find, dismissed → must_not_flag).
 */
export function evalControlState(
  f: Pick<FindingRecord, "id" | "accepted_at" | "dismissed_at">,
  agentId: string | null | undefined,
  cases: readonly EvalCase[],
): EvalControlState {
  if (!agentId) return NONE;
  const decided = !!f.accepted_at || !!f.dismissed_at;
  if (!decided) return NONE;
  if (cases.some((c) => c.expected_output.source?.finding_id === f.id)) {
    return { kind: "link", href: evalsTabHref(agentId) };
  }
  return { kind: "button", expectation: f.accepted_at ? "must_find" : "must_not_flag" };
}
