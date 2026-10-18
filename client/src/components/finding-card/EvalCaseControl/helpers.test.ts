import { describe, it, expect } from "vitest";
import type { EvalCase, FindingRecord } from "@devdigest/shared";
import { evalControlState } from "./helpers";

const F = { id: "f1", accepted_at: null, dismissed_at: null } satisfies Pick<
  FindingRecord,
  "id" | "accepted_at" | "dismissed_at"
>;

function caseFor(findingId: string): EvalCase {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "src/a.ts:1 t",
    input_diff: "",
    input_files: ["src/a.ts"],
    input_meta: { pr_number: 1, pr_title: "t", pr_body: null, repo: "o/r" },
    expected_output: {
      kind: "must_find",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      title: "t",
      severity: "WARNING",
      category: "security",
      source: {
        finding_id: findingId,
        review_id: "r1",
        pr_id: "pr1",
        repo: "o/r",
        head_sha: "abc",
        agent_id: "ag1",
        run_id: null,
      },
    },
    notes: null,
  };
}

describe("evalControlState", () => {
  it("shows nothing for an undecided finding or without an agent", () => {
    expect(evalControlState(F, "ag1", [])).toEqual({ kind: "none" });
    expect(evalControlState({ ...F, accepted_at: "t" }, null, [])).toEqual({ kind: "none" });
    expect(evalControlState({ ...F, accepted_at: "t" }, undefined, [])).toEqual({ kind: "none" });
  });

  it("maps accepted to must_find and dismissed to must_not_flag", () => {
    expect(evalControlState({ ...F, accepted_at: "t" }, "ag1", [])).toEqual({
      kind: "button",
      expectation: "must_find",
    });
    expect(evalControlState({ ...F, dismissed_at: "t" }, "ag1", [])).toEqual({
      kind: "button",
      expectation: "must_not_flag",
    });
  });

  it("links to the Evals tab when a case has this finding as its source", () => {
    const f = { ...F, accepted_at: "t" };
    expect(evalControlState(f, "ag1", [caseFor("other")]).kind).toBe("button");
    expect(evalControlState(f, "ag1", [caseFor("f1")])).toEqual({
      kind: "link",
      href: "/agents/ag1?tab=evals",
    });
  });
});
