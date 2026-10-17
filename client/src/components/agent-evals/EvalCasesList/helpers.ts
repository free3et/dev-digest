/* Pure row rules of the case list (Spec G3): what each row says about its last
   result, and the "P/T passing" count. No React, no requests. */
import type { EvalCase, EvalExpectation, EvalRunRecord, EvalSuiteRunDetail, Finding } from "@devdigest/shared";

export type RowStatus = "passed" | "failed" | "errored" | "neverRun";

export type RowSecondLine =
  | { kind: "result"; expected: 0 | 1; got: number }
  | { kind: "neverRun" }
  | { kind: "errored"; error: string | null }
  | { kind: "locationOnly" };

export interface RowView {
  /** Null while results are unavailable (AC-9): the row shows no status icon. */
  status: RowStatus | null;
  second: RowSecondLine;
  file: string;
  line: number;
}

/**
 * Number of kept findings that match the expectation by Spec A's Match rule:
 * the same file (exact string) and intersecting closed line ranges, tolerance 0.
 * Touching ranges (`end == start`) match; adjacent ones (`end + 1 == start`) do not.
 */
export function matchCount(
  kept: readonly Pick<Finding, "file" | "start_line" | "end_line">[],
  exp: Pick<EvalExpectation, "file" | "start_line" | "end_line">,
): number {
  return kept.filter((f) => f.file === exp.file && f.start_line <= exp.end_line && exp.start_line <= f.end_line).length;
}

/** The suite's records by case id. */
export function recordsByCase(detail: Pick<EvalSuiteRunDetail, "cases">): Map<string, EvalRunRecord> {
  return new Map(detail.cases.map((r) => [r.case_id, r]));
}

/**
 * One row from the case and the reference suite's records. `records === null`
 * means the results are unavailable (loading or failed): no status, only the
 * location on the second line. A case without a record is "never run".
 */
export function rowView(c: EvalCase, records: ReadonlyMap<string, EvalRunRecord> | null): RowView {
  const e = c.expected_output;
  const base = { file: e.file, line: e.start_line };
  if (!records) return { ...base, status: null, second: { kind: "locationOnly" } };
  const rec = records.get(c.id);
  if (!rec) return { ...base, status: "neverRun", second: { kind: "neverRun" } };
  if (rec.outcome === "error") return { ...base, status: "errored", second: { kind: "errored", error: rec.error } };
  return {
    ...base,
    status: rec.outcome === "passed" ? "passed" : "failed",
    second: {
      kind: "result",
      expected: e.kind === "must_find" ? 1 : 0,
      got: matchCount(rec.actual_output.kept, e),
    },
  };
}

/**
 * "P/T passing": T is the current cases, P those whose record passed. Records
 * of deleted cases are ignored (EC-2). Null without results.
 */
export function passingCount(
  cases: readonly Pick<EvalCase, "id">[],
  records: ReadonlyMap<string, EvalRunRecord> | null,
): { passed: number; total: number } | null {
  if (!records) return null;
  return { passed: cases.filter((c) => records.get(c.id)?.outcome === "passed").length, total: cases.length };
}

export type AssertParts =
  | { kind: "assertEmpty" }
  | { kind: "severity"; severity: string | null; category: string | null };

/** The right-hand text of a row: "<SEVERITY> · <category>", or "assert empty" (AC-6). */
export function assertParts(exp: Pick<EvalExpectation, "kind" | "severity" | "category">): AssertParts | null {
  if (exp.kind === "must_not_flag") return { kind: "assertEmpty" };
  const severity = exp.severity.trim().toUpperCase() || null;
  const category = exp.category.trim() || null;
  if (!severity && !category) return null;
  return { kind: "severity", severity, category };
}
