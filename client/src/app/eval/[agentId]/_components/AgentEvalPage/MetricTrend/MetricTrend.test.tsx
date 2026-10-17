import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import type { EvalSuiteRun } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";

// jsdom measures 0 x 0, so the responsive container renders nothing. Fix its
// size; everything else in Recharts stays real.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) => (
      <div style={{ width: 600, height: 240 }}>{React.cloneElement(children, { width: 600, height: 240 })}</div>
    ),
  };
});

import { MetricTrend } from "./MetricTrend";

afterEach(cleanup);

function run(id: string, version: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "a",
    agent_version: version,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: `2026-10-${String(version + 5).padStart(2, "0")}T09:30:00.000Z`,
    finished_at: null,
    case_ids: [],
    skills: [],
    cases_total: 8,
    cases_completed: 8,
    cases_passed: 8,
    cases_errored: 0,
    recall: 0.8,
    precision: 0.78,
    citation_accuracy: 0.9,
    cost_usd: null,
    duration_ms: null,
    error: null,
    ...over,
  };
}

// newest first, as the server sends it
const THREE = [run("c", 8, { recall: 0.82 }), run("b", 7), run("a", 6, { recall: 0.7, precision: null })];

describe("MetricTrend", () => {
  it("draws one line per series with data in the metric colours, without animation (AC-16)", () => {
    const { container } = renderWithProviders(<MetricTrend runs={THREE} />);
    const lines = container.querySelectorAll(".recharts-line");
    expect(lines).toHaveLength(3);
    const strokes = Array.from(container.querySelectorAll(".recharts-line-curve")).map((p) => p.getAttribute("stroke"));
    expect(strokes).toEqual(["var(--accent)", "var(--ok)", "var(--warn)"]);
    const widths = Array.from(container.querySelectorAll(".recharts-line-curve")).map((p) => Number(p.getAttribute("stroke-width")));
    expect(widths.every((w) => w >= 2)).toBe(true);
    expect(screen.getByRole("heading", { name: "Metric trend" })).toBeInTheDocument();
  });

  it("names the three series in a text legend", () => {
    renderWithProviders(<MetricTrend runs={THREE} />);
    const legend = screen.getByRole("list");
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Recall", "Precision", "Citation"]);
  });

  it("draws no line for an all-null metric and says so in the legend and the table (AC-17)", () => {
    const runs = THREE.map((r) => ({ ...r, citation_accuracy: null }));
    const { container } = renderWithProviders(<MetricTrend runs={runs} />);
    expect(container.querySelectorAll(".recharts-line")).toHaveLength(2);
    expect(screen.getByText("Citation (no data)")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Metric trend data" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    for (const r of bodyRows) expect(within(r).getAllByRole("cell")[4]).toHaveTextContent("—");
  });

  it("exposes a role=img summary with the chart hidden, and a hidden table as its sibling (AC-18)", () => {
    const { container } = renderWithProviders(<MetricTrend runs={THREE} />);
    const img = screen.getByRole("img", { name: "Metric trend over 3 finished runs, oldest to newest" });
    expect(img.firstElementChild).toHaveAttribute("aria-hidden", "true");
    // Recharts' tooltip wrapper carries tabindex="-1": programmatic only, never a tab stop.
    const tabindexes = Array.from(container.querySelectorAll("[tabindex]")).map((e) => e.getAttribute("tabindex"));
    expect(tabindexes.every((v) => v === "-1")).toBe(true);

    const table = screen.getByRole("table", { name: "Metric trend data" });
    expect(img).not.toContainElement(table);
    expect(img.contains(table)).toBe(false);
    expect(table.style.position).toBe("absolute");
    expect(table.style.width).toBe("1px");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Version", "Ran at", "Recall", "Precision", "Citation"]);
    const body = within(table).getAllByRole("row").slice(1);
    expect(body).toHaveLength(3);
    const cells = body.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells).toEqual([
      ["v6", "2026-10-11 09:30", "70%", "—", "90%"],
      ["v7", "2026-10-12 09:30", "80%", "78%", "90%"],
      ["v8", "2026-10-13 09:30", "82%", "78%", "90%"],
    ]);
  });

  it("shows the empty text for no finished run and no chart or table (AC-20)", () => {
    renderWithProviders(<MetricTrend runs={[run("r", 1, { status: "running" })]} />);
    expect(screen.getByText("No finished runs yet.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("asks for a second finished run when there is only one (AC-20)", () => {
    const { container } = renderWithProviders(<MetricTrend runs={[run("a", 1), run("f", 2, { status: "failed" })]} />);
    expect(screen.getByText("The trend needs at least two finished runs.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Metric trend over/ })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelector(".recharts-wrapper")).toBeNull();
  });

  it("counts only finished runs in the summary", () => {
    renderWithProviders(<MetricTrend runs={[run("r", 9, { status: "running" }), ...THREE.slice(0, 2)]} />);
    expect(screen.getByRole("img", { name: "Metric trend over 2 finished runs, oldest to newest" })).toBeInTheDocument();
  });
});
