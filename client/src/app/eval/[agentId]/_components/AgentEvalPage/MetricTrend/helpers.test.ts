import { describe, expect, it } from "vitest";
import type { EvalSuiteRun } from "@devdigest/shared";
import { seriesHasData, tooltipContent, trendRows } from "./helpers";

const run = (id: string, over: Partial<EvalSuiteRun>) =>
  ({
    id,
    status: "done",
    agent_version: 1,
    ran_at: "2026-10-12T09:30:00.000Z",
    recall: null,
    precision: null,
    citation_accuracy: null,
    ...over,
  }) as EvalSuiteRun;

describe("trendRows", () => {
  it("keeps finished runs only, oldest first, as whole percents with null kept null", () => {
    const rows = trendRows([
      run("c", { agent_version: 7, recall: 0.82, precision: 0.784, citation_accuracy: null }),
      run("r", { status: "running", agent_version: 8 }),
      run("f", { status: "failed", agent_version: 9, recall: 0.1 }),
      run("b", { status: "partial", agent_version: 6, recall: 0.7, precision: 0, citation_accuracy: 0.9 }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["v6", "v7"]);
    expect(rows[0]).toMatchObject({ idx: 0, id: "b", version: 6, recall: 70, precision: 0, citation: 90 });
    expect(rows[1]).toMatchObject({ idx: 1, id: "c", version: 7, recall: 82, precision: 78, citation: null });
  });

  it("gives repeated versions distinct indexes", () => {
    const rows = trendRows([run("b", { agent_version: 7 }), run("a", { agent_version: 7 })]);
    expect(rows.map((r) => [r.idx, r.label, r.id])).toEqual([
      [0, "v7", "a"],
      [1, "v7", "b"],
    ]);
  });

  it("is empty without finished runs", () => {
    expect(trendRows([])).toEqual([]);
    expect(trendRows([run("r", { status: "running" })])).toEqual([]);
  });
});

describe("seriesHasData", () => {
  it("is false only when the metric is null in every row; zero is data", () => {
    const rows = trendRows([run("b", { recall: 0, citation_accuracy: null }), run("a", { recall: null })]);
    expect(seriesHasData(rows, "recall")).toBe(true);
    expect(seriesHasData(rows, "precision")).toBe(false);
    expect(seriesHasData(rows, "citation")).toBe(false);
    expect(seriesHasData([], "recall")).toBe(false);
  });
});

describe("tooltipContent", () => {
  it("lists version, time and the three metrics, null as null", () => {
    const [row] = trendRows([run("a", { agent_version: 7, recall: 0.82, precision: 0.78 })]);
    expect(tooltipContent(row!)).toEqual({
      version: 7,
      ranAt: "2026-10-12T09:30:00.000Z",
      metrics: [
        { key: "recall", percent: 82 },
        { key: "precision", percent: 78 },
        { key: "citation", percent: null },
      ],
    });
  });
});
