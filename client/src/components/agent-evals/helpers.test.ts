import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  finishedOldestFirst,
  hostLabel,
  isFinished,
  referenceSuite,
  metricPoints,
  resolveOwner,
  runVersion,
  sameCaseSet,
  skillRefusalKey,
} from "./helpers";

describe("EvalsTab helpers", () => {
  it("compares case sets regardless of order", () => {
    expect(sameCaseSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameCaseSet(["a"], ["a", "b"])).toBe(false);
    expect(sameCaseSet(["a", "a"], ["a", "b"])).toBe(false);
    expect(sameCaseSet([], [])).toBe(true);
  });

  it("treats only done and partial runs as finished", () => {
    expect(isFinished({ status: "done" })).toBe(true);
    expect(isFinished({ status: "partial" })).toBe(true);
    expect(isFinished({ status: "running" })).toBe(false);
    expect(isFinished({ status: "failed" })).toBe(false);
  });
});

type R = { id: string; status: "done" | "partial" | "running" | "failed"; recall: number | null; precision: number | null; citation_accuracy: number | null };
const run = (id: string, status: R["status"], recall: number | null, precision: number | null = 0.5): R => ({
  id,
  status,
  recall,
  precision,
  citation_accuracy: null,
});

describe("series helpers (Spec F AC-14, AC-26)", () => {
  it("returns finished runs oldest first from a newest-first list", () => {
    const runs = [run("c", "done", 0.9), run("run", "running", null), run("b", "partial", 0.8), run("f", "failed", null), run("a", "done", 0.7)];
    expect(finishedOldestFirst(runs).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(runs.map((r) => r.id)).toEqual(["c", "run", "b", "f", "a"]);
  });

  it("drops running, failed and null values from metric points, oldest first", () => {
    const runs = [run("d", "done", 0.82), run("r", "running", 0.1), run("c", "done", null), run("b", "partial", 0.75), run("a", "done", 0.7)];
    expect(metricPoints(runs, "recall")).toEqual([0.7, 0.75, 0.82]);
  });

  it("keeps partial series and handles empty and all-null input", () => {
    expect(metricPoints([], "recall")).toEqual([]);
    expect(metricPoints([run("a", "done", 0.5, null), run("b", "done", 0.6, 0.4)], "precision")).toEqual([0.4]);
    expect(metricPoints([run("a", "done", 0.5)], "citation_accuracy")).toEqual([]);
  });
});

describe("owner helpers (Spec G2)", () => {
  it("resolves the legacy agentId and an explicit owner", () => {
    expect(resolveOwner({ agentId: "a1" })).toEqual({ kind: "agent", id: "a1" });
    expect(resolveOwner({ owner: { kind: "skill", id: "s1" } })).toEqual({ kind: "skill", id: "s1" });
  });

  it("maps every G1 refusal code, 429, status 0 and a non-ApiError", () => {
    for (const code of [
      "host_required",
      "host_not_found",
      "host_not_allowed",
      "not_agent_case",
      "eval_run_in_progress",
      "no_cases",
      "too_many_cases",
      "invalid_diff",
      "not_found",
    ]) {
      expect(skillRefusalKey(new ApiError("x", 422, code))).toBe(code);
    }
    expect(skillRefusalKey(new ApiError("x", 429, "internal_error"))).toBe("rate_limited");
    expect(skillRefusalKey(new ApiError("x", 0, "network_error"))).toBe("network_error");
    expect(skillRefusalKey(new Error("boom"))).toBe("network_error");
    expect(skillRefusalKey(new ApiError("x", 500, "weird"))).toBe("unknown");
  });

  it("picks the version by owner kind and falls back to the agent's", () => {
    expect(runVersion({ agent_version: 7, skill_version: 3 }, "skill")).toBe(3);
    expect(runVersion({ agent_version: 7, skill_version: 3 }, "agent")).toBe(7);
    expect(runVersion({ agent_version: 7, skill_version: null }, "skill")).toBe(7);
  });

  it("labels a host as known, deleted or loading", () => {
    const hosts = new Map([["h1", { id: "h1", name: "Reviewer A", model: "gpt-x" }]]);
    expect(hostLabel(hosts, "h1", 7)).toEqual({ kind: "known", name: "Reviewer A", version: 7 });
    expect(hostLabel(hosts, "gone", 1)).toEqual({ kind: "deleted" });
    expect(hostLabel(undefined, "h1", 1)).toEqual({ kind: "loading" });
  });
});

describe("referenceSuite (Spec G3 AC-1)", () => {
  it("is the newest done or partial suite; running and failed are skipped", () => {
    const runs = [
      { id: "a", status: "running" as const },
      { id: "b", status: "failed" as const },
      { id: "c", status: "partial" as const },
      { id: "d", status: "done" as const },
    ];
    expect(referenceSuite(runs)?.id).toBe("c");
    expect(referenceSuite([runs[0]!, runs[1]!])).toBeUndefined();
    expect(referenceSuite(undefined)).toBeUndefined();
  });
});
