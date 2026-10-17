import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import type { EvalSuiteRun } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { MetricCards } from "./MetricCards";

afterEach(cleanup);

function run(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "a",
    agent_version: 1,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: "2026-10-12T09:30:00.000Z",
    finished_at: "2026-10-12T09:31:00.000Z",
    case_ids: [],
    skills: [],
    cases_total: 8,
    cases_completed: 8,
    cases_passed: 8,
    cases_errored: 0,
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.8,
    cost_usd: null,
    duration_ms: null,
    error: null,
    ...over,
  };
}

/** The card element: caption span -> main column -> card. */
function card(name: string): HTMLElement {
  return screen.getByText(name).parentElement!.parentElement as HTMLElement;
}

describe("MetricCards", () => {
  it("shows three cards in order with newest percent, point delta and no decimal or arrow text (AC-13)", () => {
    const runs = [run("c", { recall: 0.82 }), run("b", { recall: 0.78 }), run("a", { recall: 0.7 })];
    renderWithProviders(<MetricCards runs={runs} />);
    const captions = ["Recall", "Precision", "Citation accuracy"].map((n) => screen.getByText(n));
    expect(captions.map((c) => c.style.textTransform)).toEqual(["uppercase", "uppercase", "uppercase"]);
    expect(captions[0]!.compareDocumentPosition(captions[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(captions[1]!.compareDocumentPosition(captions[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const recall = card("Recall");
    expect(within(recall).getByText("82%")).toBeInTheDocument();
    expect(within(recall).getByText("82%").parentElement!.style.fontSize).toBe("28px");
    expect(within(recall).getByText("82%").parentElement!.style.fontWeight).toBe("700");
    expect(within(recall).getByText("82%").parentElement!.style.color).toBe("var(--accent)");
    expect(within(recall).getByRole("img", { name: "up 4 pt" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/0\.04|↑/);
  });

  it("names the sparkline with its range and drops it when only one value exists (AC-14)", () => {
    const runs = [run("c", { recall: 0.82 }), run("b", { recall: 0.78 }), run("a", { recall: 0.7 })];
    renderWithProviders(<MetricCards runs={runs} />);
    expect(within(card("Recall")).getByRole("img", { name: "Recall trend over 3 runs: from 70% to 82%" })).toBeInTheDocument();
    cleanup();
    renderWithProviders(<MetricCards runs={[run("b", { recall: 0.8 }), run("a", { recall: null })]} />);
    expect(within(card("Recall")).queryByRole("img", { name: /trend over/ })).toBeNull();
  });

  it("shows a dash delta with one finished run and a dash value without a delta for a null newest (AC-13)", () => {
    renderWithProviders(<MetricCards runs={[run("a", { precision: null, recall: 0.5 })]} />);
    const recall = card("Recall");
    expect(within(recall).getByText("50%")).toBeInTheDocument();
    expect(within(recall).getByText("—")).toBeInTheDocument();
    expect(within(recall).queryByRole("img")).toBeNull();
    const precision = card("Precision");
    expect(within(precision).getByText("—")).toBeInTheDocument();
    expect(within(precision).queryByRole("img")).toBeNull();
  });

  it("skips a running run in between when it takes the previous value", () => {
    renderWithProviders(
      <MetricCards runs={[run("c", { recall: 0.9 }), run("r", { status: "running", recall: null }), run("a", { recall: 0.8 })]} />,
    );
    expect(within(card("Recall")).getByRole("img", { name: "up 10 pt" })).toBeInTheDocument();
  });

  it("shows only dashes and no image while the only run is running (AC-15)", () => {
    renderWithProviders(<MetricCards runs={[run("r", { status: "running", recall: null, precision: null, citation_accuracy: null })]} />);
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
