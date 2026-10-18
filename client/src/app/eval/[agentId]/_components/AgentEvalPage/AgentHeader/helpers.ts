import type { EvalSuiteRun } from "@devdigest/shared";
import { finishedOldestFirst, sameCaseSet } from "@/components/agent-evals/helpers";

export type Subtitle =
  | { kind: "none" }
  | { kind: "same"; count: number; cases: number }
  | { kind: "different"; count: number };

/**
 * What the subtitle says about the loaded history (Spec F AC-8, C-12). Only
 * finished runs count; "same" needs every finished run over one case set.
 */
export function subtitleFor(runs: readonly Pick<EvalSuiteRun, "status" | "case_ids">[]): Subtitle {
  const finished = finishedOldestFirst(runs);
  const first = finished[0];
  if (!first) return { kind: "none" };
  const same = finished.every((r) => sameCaseSet(r.case_ids, first.case_ids));
  return same
    ? { kind: "same", count: finished.length, cases: first.case_ids.length }
    : { kind: "different", count: finished.length };
}
