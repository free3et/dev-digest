import { describe, expect, it } from "vitest";
import type { EvalRunRecord, EvalSuiteRunDetail } from "@devdigest/shared";
import { buildCaseRows, caseSetSubtitle, costDelta, lineDiff, orderRuns } from "./helpers";

function rec(case_id: string, outcome: "passed" | "failed" | "error", name = `name-${case_id}`): EvalRunRecord {
  return {
    id: `r-${case_id}`,
    case_id,
    case_name: name,
    suite_run_id: "s",
    ran_at: "2026-10-12T00:00:00.000Z",
    actual_output: {
      kept: [],
      dropped: [],
      outcome,
      expectation_kind: "must_find",
      matched: null,
      findings_kept: null,
      findings_dropped: null,
      error: null,
    },
    pass: outcome === "passed",
    outcome,
    expectation_kind: "must_find",
    findings_kept: null,
    findings_dropped: null,
    matched: null,
    error: null,
    recall: null,
    precision: null,
    citation_accuracy: null,
    duration_ms: 1500,
    cost_usd: 0.01,
  };
}

function detail(case_ids: string[], cases: EvalRunRecord[]): EvalSuiteRunDetail {
  return {
    id: "s",
    agent_id: "ag",
    agent_version: 1,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: "2026-10-12T00:00:00.000Z",
    finished_at: null,
    case_ids,
    skills: [],
    cases_total: case_ids.length,
    cases_completed: 0,
    cases_passed: 0,
    cases_errored: 0,
    recall: null,
    precision: null,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    error: null,
    cases,
  };
}

describe("compare helpers", () => {
  it("orders runs by ran_at, older first", () => {
    const [a, b] = orderRuns({ ran_at: "2026-10-12T10:00:00Z", n: 1 }, { ran_at: "2026-10-11T10:00:00Z", n: 2 });
    expect([a.n, b.n]).toEqual([2, 1]);
    expect(orderRuns({ ran_at: "2026-10-12T10:00:00Z", n: 1 }, { ran_at: "2026-10-12T10:00:00Z", n: 2 })[0].n).toBe(1);
  });

  it("computes the signed cost difference B − A, flat when equal, null with a null side", () => {
    expect(costDelta(0.04, 0.06)).toEqual({ direction: "up", cost: "$0.02" });
    expect(costDelta(0.06, 0.05)).toEqual({ direction: "down", cost: "$0.01" });
    expect(costDelta(0.05, 0.05)).toEqual({ direction: "flat", text: "$0.00" });
    expect(costDelta(0, 0)).toEqual({ direction: "flat", text: "$0.00" });
    expect(costDelta(0, 0.06)).toEqual({ direction: "up", cost: "$0.06" });
    expect(costDelta(null, 0.06)).toBeNull();
    expect(costDelta(0.06, null)).toBeNull();
    expect(costDelta(0.1, 0.1 + 1e-9)).toEqual({ direction: "flat", text: "$0.00" });
  });

  it("builds the union, labels absent and deleted cases, and puts changed rows first", () => {
    const a = detail(["c1", "c2", "c3"], [rec("c1", "passed"), rec("c2", "passed")]); // c3 deleted later
    const b = detail(["c1", "c2", "c4"], [rec("c1", "passed"), rec("c2", "failed"), rec("c4", "error")]);
    const rows = buildCaseRows(a, b);
    expect(rows.map((r) => r.caseId)).toEqual(["c2", "c3", "c4", "c1"]);
    expect(rows.find((r) => r.caseId === "c3")).toMatchObject({
      a: { kind: "caseDeleted" },
      b: { kind: "notInRun" },
      changed: true,
    });
    expect(rows.find((r) => r.caseId === "c4")).toMatchObject({ a: { kind: "notInRun" }, b: { kind: "error" } });
    expect(rows.find((r) => r.caseId === "c1")!.changed).toBe(false);
    // name falls back to the id when no record exists on either side
    expect(rows.find((r) => r.caseId === "c3")!.name).toBe("c3");
  });

  it("diffs lines with an LCS", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" },
    ]);
    expect(lineDiff("x", "x").every((l) => l.kind === "same")).toBe(true);
    expect(lineDiff("", "a")).toEqual([
      { kind: "removed", text: "" },
      { kind: "added", text: "a" },
    ]);
  });
});

describe("caseSetSubtitle", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
  it("returns the shared count for the same set, in any order, else different", () => {
    expect(caseSetSubtitle({ case_ids: ids(8) }, { case_ids: ids(8) })).toEqual({ same: true, count: 8 });
    expect(caseSetSubtitle({ case_ids: ids(1) }, { case_ids: ids(1) })).toEqual({ same: true, count: 1 });
    expect(caseSetSubtitle({ case_ids: ["a", "b"] }, { case_ids: ["b", "a"] })).toEqual({ same: true, count: 2 });
    expect(caseSetSubtitle({ case_ids: ["a", "b"] }, { case_ids: ["a", "c"] })).toEqual({ same: false });
    expect(caseSetSubtitle({ case_ids: ["a"] }, { case_ids: ["a", "b"] })).toEqual({ same: false });
  });
});
