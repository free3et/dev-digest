import type { EvalCaseOutcome, EvalRunRecord, EvalSuiteRunDetail } from "@devdigest/shared";
import { formatCostUsd, metricDelta } from "@/lib/format";
import { sameCaseSet } from "../helpers";

/** Run A is the one with the older `ran_at`; ties keep the given order. */
export function orderRuns<T extends { ran_at: string }>(x: T, y: T): [T, T] {
  return Date.parse(y.ran_at) < Date.parse(x.ran_at) ? [y, x] : [x, y];
}

export type CostDelta = { direction: "flat"; text: string } | { direction: "up" | "down"; cost: string };

/**
 * Cost difference B − A for the Cost tile (AC-7). Null when either side is
 * null; rounded to 6 dp before the equality check so float noise is not a
 * difference; a genuine 0 difference is "flat".
 */
export function costDelta(a: number | null | undefined, b: number | null | undefined): CostDelta | null {
  const d = metricDelta(a, b);
  if (d === null) return null;
  if (d === 0) return { direction: "flat", text: formatCostUsd(0) };
  return { direction: d > 0 ? "up" : "down", cost: formatCostUsd(Math.abs(d)) };
}

export type CaseCellKind = EvalCaseOutcome | "notInRun" | "caseDeleted";

export interface CaseCell {
  kind: CaseCellKind;
  duration_ms: number | null;
  cost_usd: number | null;
}

export interface CaseRow {
  caseId: string;
  name: string;
  a: CaseCell;
  b: CaseCell;
  changed: boolean;
}

const ABSENT = { duration_ms: null, cost_usd: null } as const;

function cell(run: EvalSuiteRunDetail, caseId: string): { cell: CaseCell; name: string | null } {
  if (!run.case_ids.includes(caseId)) return { cell: { kind: "notInRun", ...ABSENT }, name: null };
  const rec: EvalRunRecord | undefined = run.cases.find((c) => c.case_id === caseId);
  // In case_ids but no record: the case was deleted later (cascade removed its row).
  if (!rec) return { cell: { kind: "caseDeleted", ...ABSENT }, name: null };
  return {
    cell: { kind: rec.outcome, duration_ms: rec.duration_ms, cost_usd: rec.cost_usd },
    name: rec.case_name ?? null,
  };
}

/**
 * Per-case rows over the union of both runs' `case_ids` (A's order, then B's
 * extras). Rows whose outcome differs between A and B come first; both groups
 * keep the union order.
 */
export function buildCaseRows(a: EvalSuiteRunDetail, b: EvalSuiteRunDetail): CaseRow[] {
  const ids = [...a.case_ids, ...b.case_ids.filter((id) => !a.case_ids.includes(id))];
  const rows = ids.map((caseId): CaseRow => {
    const ca = cell(a, caseId);
    const cb = cell(b, caseId);
    return {
      caseId,
      name: ca.name ?? cb.name ?? caseId,
      a: ca.cell,
      b: cb.cell,
      changed: ca.cell.kind !== cb.cell.kind,
    };
  });
  return [...rows.filter((r) => r.changed), ...rows.filter((r) => !r.changed)];
}

export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
}

/** Above this many DP cells the LCS is skipped and the diff degrades to remove-all / add-all. */
const MAX_LCS_CELLS = 4_000_000;

/** Line diff of two texts via longest common subsequence. Pure; no trimming of lines. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_LCS_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ kind: "removed", text })),
      ...b.map((text): DiffLine => ({ kind: "added", text })),
    ];
  }
  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      out.push({ kind: "removed", text: a[i++]! });
    } else {
      out.push({ kind: "added", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "removed", text: a[i++]! });
  while (j < m) out.push({ kind: "added", text: b[j++]! });
  return out;
}

export type CaseSetSubtitle = { same: true; count: number } | { same: false };

/** Compare subtitle input (AC-19): the shared case count, or "different sets". */
export function caseSetSubtitle(
  a: Pick<EvalSuiteRunDetail, "case_ids">,
  b: Pick<EvalSuiteRunDetail, "case_ids">,
): CaseSetSubtitle {
  return sameCaseSet(a.case_ids, b.case_ids) ? { same: true, count: a.case_ids.length } : { same: false };
}
