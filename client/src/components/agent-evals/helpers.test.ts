import { describe, expect, it } from "vitest";
import { finishedOldestFirst, isFinished, metricPoints, sameCaseSet } from "./helpers";

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
