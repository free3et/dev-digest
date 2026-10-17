import { describe, expect, it } from "vitest";
import type { EvalCase, EvalRunRecord } from "@devdigest/shared";
import { assertParts, matchCount, passingCount, recordsByCase, rowView } from "./helpers";

const kept = (file: string, start_line: number, end_line: number) => ({ file, start_line, end_line });
const exp = { file: "src/a.ts", start_line: 10, end_line: 12 };

describe("matchCount (Spec A Match rule)", () => {
  it("counts the intersecting finding in the same file only", () => {
    expect(matchCount([kept("src/a.ts", 11, 11), kept("src/b.ts", 11, 11)], exp)).toBe(1);
  });
  it("matches touching ranges and rejects adjacent ones", () => {
    expect(matchCount([kept("src/a.ts", 12, 15)], exp)).toBe(1);
    expect(matchCount([kept("src/a.ts", 5, 10)], exp)).toBe(1);
    expect(matchCount([kept("src/a.ts", 13, 15)], exp)).toBe(0);
    expect(matchCount([kept("src/a.ts", 5, 9)], exp)).toBe(0);
  });
  it("needs the exact path string", () => {
    expect(matchCount([kept("./src/a.ts", 10, 12), kept("src/A.ts", 10, 12)], exp)).toBe(0);
  });
});

function ec(id: string, kind: "must_find" | "must_not_flag" = "must_find"): EvalCase {
  return {
    id,
    expected_output: { kind, file: "src/a.ts", start_line: 10, end_line: 12, title: "t", severity: "critical", category: "security", source: null },
  } as unknown as EvalCase;
}
function rec(case_id: string, outcome: "passed" | "failed" | "error", findings: ReturnType<typeof kept>[] = [], error: string | null = null) {
  return { case_id, outcome, error, actual_output: { kept: findings } } as unknown as EvalRunRecord;
}

describe("rowView", () => {
  const records = recordsByCase({
    cases: [rec("p", "passed", [kept("src/a.ts", 11, 11)]), rec("f", "failed"), rec("e", "error", [], "boom")],
  });
  it("derives status and the second line from the record", () => {
    expect(rowView(ec("p"), records)).toEqual({ status: "passed", second: { kind: "result", expected: 1, got: 1 }, file: "src/a.ts", line: 10 });
    expect(rowView(ec("f", "must_not_flag"), records).second).toEqual({ kind: "result", expected: 0, got: 0 });
    expect(rowView(ec("e"), records)).toMatchObject({ status: "errored", second: { kind: "errored", error: "boom" } });
    expect(rowView(ec("none"), records)).toMatchObject({ status: "neverRun", second: { kind: "neverRun" } });
  });
  it("shows only the location while results are unavailable", () => {
    expect(rowView(ec("p"), null)).toMatchObject({ status: null, second: { kind: "locationOnly" }, file: "src/a.ts", line: 10 });
  });
});

describe("passingCount", () => {
  const cases = Array.from({ length: 20 }, (_, i) => ec(`c${i}`));
  const passedRecs = (n: number) => recordsByCase({ cases: cases.slice(0, n).map((c) => rec(c.id, "passed")) });
  it("is P/T over the current cases", () => {
    expect(passingCount(cases, passedRecs(17))).toEqual({ passed: 17, total: 20 });
  });
  it("counts a case added after the suite in T only", () => {
    expect(passingCount([...cases, ec("late")], passedRecs(17))).toEqual({ passed: 17, total: 21 });
  });
  it("ignores the record of a deleted case", () => {
    const withGhost = recordsByCase({ cases: [...cases.slice(0, 17).map((c) => rec(c.id, "passed")), rec("deleted", "passed")] });
    expect(passingCount(cases, withGhost)).toEqual({ passed: 17, total: 20 });
  });
  it("is null without a reference suite", () => {
    expect(passingCount(cases, null)).toBeNull();
  });
});

describe("assertParts", () => {
  const base = { kind: "must_find" as const, severity: "critical", category: "security" };
  it("upper-cases the severity and keeps the category", () => {
    expect(assertParts(base)).toEqual({ kind: "severity", severity: "CRITICAL", category: "security" });
  });
  it("drops an empty part and returns null when both are empty", () => {
    expect(assertParts({ ...base, severity: "" })).toEqual({ kind: "severity", severity: null, category: "security" });
    expect(assertParts({ ...base, severity: "", category: " " })).toBeNull();
  });
  it("is 'assert empty' for must_not_flag", () => {
    expect(assertParts({ ...base, kind: "must_not_flag" })).toEqual({ kind: "assertEmpty" });
  });
});
