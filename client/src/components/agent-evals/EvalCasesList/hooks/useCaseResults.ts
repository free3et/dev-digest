/* useCaseResults — the last result of every case of one owner (Spec G3 AC-8,
   AC-9). The reference suite is the newest finished suite of the owner's
   history (the same query the run control and the banner already share), and
   its detail is the one extra request (`GET /eval-runs/:id`, NFR-2), cached
   under the key the compare dialog and the run tracker use. A per-case Run
   never touches these keys, so it cannot change a status. */
"use client";

import type { EvalRunRecord } from "@devdigest/shared";
import { useEvalRun, useOwnerEvalRuns, type EvalOwner } from "@/lib/hooks/eval";
import { referenceSuite } from "../../helpers";
import { recordsByCase } from "../helpers";

export interface CaseResults {
  /**
   * Records by case id. `null` while the history or the reference suite is
   * loading or failed (rows then show no status). Empty when the owner has no
   * finished suite: every case is "never run".
   */
  records: ReadonlyMap<string, EvalRunRecord> | null;
  /** True when a reference suite exists; the heading shows "P/T passing" only then. */
  hasReference: boolean;
}

const NO_RECORDS: ReadonlyMap<string, EvalRunRecord> = new Map();

export function useCaseResults(owner: EvalOwner): CaseResults {
  const runs = useOwnerEvalRuns(owner);
  const reference = referenceSuite(runs.data);
  const detail = useEvalRun(reference?.id);

  if (runs.isLoading || runs.isError || !runs.data) return { records: null, hasReference: false };
  if (!reference) return { records: NO_RECORDS, hasReference: false };
  if (!detail.data) return { records: null, hasReference: false };
  return { records: recordsByCase(detail.data), hasReference: true };
}
