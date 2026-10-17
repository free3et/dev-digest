import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { EvalSuiteRun, EvalSuiteRunDetail } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function suite(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "ag1",
    agent_version: 1,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: "2026-10-10T10:00:00.000Z",
    finished_at: "2026-10-10T10:01:00.000Z",
    case_ids: [],
    skills: [],
    cases_total: 0,
    cases_completed: 0,
    cases_passed: 0,
    cases_errored: 0,
    recall: 0.5,
    precision: 0.75,
    citation_accuracy: 1,
    cost_usd: 0.01,
    duration_ms: 1000,
    error: null,
    ...over,
  };
}

const OLD = suite("old");
const NEW = suite("new", { agent_version: 2, ran_at: "2026-10-12T10:00:00.000Z", recall: 0.75 });
// Recall went up and nothing dipped: no banner in the compare flow test.

describe("EvalsTab", () => {
  it("renders a titled section from the eval namespace", () => {
    renderWithProviders(<EvalsTab agentId="ag1" />);
    expect(screen.getByRole("heading", { name: "Eval metrics" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Eval metrics" })).toBeTruthy();
  });

  it("Compare opens a dialog over the history, which keeps its selection; Close returns focus to Compare", async () => {
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": [],
      "GET /agents/ag1/eval-runs": [NEW, OLD],
      "GET /eval-runs/old": { ...OLD, cases: [] } satisfies EvalSuiteRunDetail,
      "GET /eval-runs/new": { ...NEW, cases: [] } satisfies EvalSuiteRunDetail,
      "GET /agents/ag1/versions/1": { agent_id: "ag1", version: 1, created_at: "x", config: { system_prompt: "Be strict." } },
      "GET /agents/ag1/versions/2": { agent_id: "ag1", version: 2, created_at: "x", config: { system_prompt: "Be kind." } },
    });
    renderWithProviders(<EvalsTab agentId="ag1" />);

    const compare = await screen.findByRole("button", { name: "Compare" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(compare).toBeDisabled();

    // one run is not enough, two enables Compare
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run from 2026-10-12 10:00" }));
    expect(compare).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run from 2026-10-10 10:00" }));
    expect(compare).toBeEnabled();
    compare.focus(); // the dialog returns focus to whatever was focused when it opened
    fireEvent.click(compare);

    // AC-4: a dialog, not part of the tab's section; AC-11: the history stays rendered
    const dialog = await screen.findByRole("dialog", { name: "Compare runs · v1 → v2" });
    expect(screen.getByRole("region", { name: "Eval metrics" }).contains(dialog)).toBe(false);
    expect(screen.getByRole("region", { name: "Recent runs" })).toBeInTheDocument();
    expect(await within(dialog).findByRole("group", { name: "Metric comparison" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith("/eval-runs/")).map((c) => c.path).sort()).toEqual([
      "/eval-runs/new",
      "/eval-runs/old",
    ]);

    // Close (footer button): the dialog is gone, the selection survived, focus is back on Compare
    const closes = within(dialog).getAllByRole("button", { name: "Close" });
    fireEvent.click(closes[closes.length - 1]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select run from 2026-10-12 10:00" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select run from 2026-10-10 10:00" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Compare" })).toHaveFocus();
    // the compare flow only reads
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("shows the regression banner above the history from the same request, with the case-set sentence", async () => {
    const dipped = suite("new", {
      agent_version: 7,
      ran_at: "2026-10-12T10:00:00.000Z",
      recall: 0.75,
      precision: 0.65,
      citation_accuracy: 1,
      case_ids: ["c1", "c2"],
    });
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": [],
      "GET /agents/ag1/eval-runs": [dipped, suite("old", { agent_version: 6, case_ids: ["c1"], citation_accuracy: 0.8 })],
    });
    renderWithProviders(<EvalsTab agentId="ag1" />);

    const banner = await screen.findByRole("note", { name: "Regression" });
    expect(banner).toHaveTextContent(
      "Precision dipped 10 pts on v7. Recall and citation both up. Metrics are over different case sets.",
    );
    const heading = await screen.findByRole("heading", { name: "Recent runs" });
    expect(banner.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // banner and history share one query
    expect(calls.filter((c) => c.path === "/agents/ag1/eval-runs")).toHaveLength(1);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("omits the case-set sentence for equal sets, and a sub-point dip reads '<1 pt'", async () => {
    mockFetch({
      "GET /agents/ag1/eval-cases": [],
      "GET /agents/ag1/eval-runs": [
        suite("new", { agent_version: 3, ran_at: "2026-10-12T10:00:00.000Z", precision: 0.798, recall: 0.5 }),
        suite("old", { agent_version: 2, precision: 0.801, recall: 0.5 }),
      ],
    });
    renderWithProviders(<EvalsTab agentId="ag1" />);
    const banner = await screen.findByRole("note", { name: "Regression" });
    expect(banner.textContent).toBe("Precision dipped <1 pt on v3.");
  });

  it("shows no banner while the history loads or after it fails", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        if (path === "/agents/ag1/eval-runs") {
          await gate;
          return new Response("{}", { status: 500 });
        }
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    renderWithProviders(<EvalsTab agentId="ag1" />);
    expect(screen.getByText("Loading run history…")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: "Regression" })).toBeNull();
    release();
    expect(await screen.findByText("Couldn’t load run history")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: "Regression" })).toBeNull();
  });
});
