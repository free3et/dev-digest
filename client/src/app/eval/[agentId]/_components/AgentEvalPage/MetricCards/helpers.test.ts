import { describe, expect, it } from "vitest";
import { metricCardView } from "./helpers";

type S = "done" | "partial" | "running" | "failed";
const run = (status: S, recall: number | null, precision: number | null = null) => ({
  status,
  recall,
  precision,
  citation_accuracy: null,
});

describe("metricCardView", () => {
  it("takes the newest finished value and the delta against the previous finished run", () => {
    const v = metricCardView([run("done", 0.82), run("done", 0.78), run("done", 0.7)], "recall");
    expect(v.value).toBe(0.82);
    expect(v.delta).toEqual({ direction: "up", points: 4, belowOne: false });
    expect(v.points).toEqual([0.7, 0.78, 0.82]);
  });

  it("has no delta with a single finished run", () => {
    const v = metricCardView([run("done", 0.8)], "recall");
    expect(v.value).toBe(0.8);
    expect(v.delta).toBeNull();
    expect(v.points).toEqual([0.8]);
  });

  it("shows null newest as a null value with no delta", () => {
    const v = metricCardView([run("done", null, null), run("done", 0.8, 0.7)], "precision");
    expect(v.value).toBeNull();
    expect(v.delta).toBeNull();
    expect(v.points).toEqual([0.7]);
  });

  it("skips running and failed runs in between", () => {
    const v = metricCardView([run("partial", 0.9), run("running", null), run("failed", 0.1), run("done", 0.6)], "recall");
    expect(v.value).toBe(0.9);
    expect(v.delta).toEqual({ direction: "up", points: 30, belowOne: false });
  });

  it("is empty without finished runs", () => {
    expect(metricCardView([run("running", null)], "recall")).toEqual({ value: null, delta: null, points: [] });
    expect(metricCardView([], "recall")).toEqual({ value: null, delta: null, points: [] });
  });

  it("has no delta when the previous run's value is null", () => {
    const v = metricCardView([run("done", 0.8), run("done", null)], "recall");
    expect(v.value).toBe(0.8);
    expect(v.delta).toBeNull();
  });
});
