import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { EvalSuiteRun } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { EvalRunHistory } from "./EvalRunHistory";
import messages from "../../../../messages/en/eval.json";
import { effectiveSelection, isSelectable, toggleId } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function run(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "ag1",
    agent_version: 2,
    status: "done",
    ran_at: "2026-10-12T09:30:00.000Z",
    finished_at: "2026-10-12T09:31:00.000Z",
    case_ids: ["c1"],
    skills: [],
    cases_total: 4,
    cases_completed: 4,
    cases_passed: 3,
    cases_errored: 0,
    recall: 0.75,
    precision: 0.5,
    citation_accuracy: null,
    cost_usd: 0.014,
    duration_ms: 1000,
    error: null,
    ...over,
  };
}

const RUNS = [
  run("a", { ran_at: "2026-10-12T10:00:00.000Z" }),
  run("b", { ran_at: "2026-10-11T10:00:00.000Z", status: "partial", cost_usd: null, cases_errored: 1 }),
  run("c", { ran_at: "2026-10-10T10:00:00.000Z", status: "failed", recall: null, precision: null }),
  run("d", { ran_at: "2026-10-09T10:00:00.000Z", status: "running", recall: null, precision: null }),
  run("e", { ran_at: "2026-10-08T10:00:00.000Z" }),
];

describe("EvalRunHistory", () => {
  it("lists runs with em dashes for nulls and gates Compare on exactly two finished runs", async () => {
    mockFetch({ "GET /agents/ag1/eval-runs": RUNS });
    const onCompare = vi.fn();
    renderWithProviders(<EvalRunHistory agentId="ag1" onCompare={onCompare} />);
    expect(screen.getByText("Loading run history…")).toBeInTheDocument();

    expect(await screen.findByText("2026-10-12 10:00")).toBeInTheDocument();
    expect(screen.getByTitle("2026-10-12 10:00 UTC")).toBeInTheDocument();
    expect(screen.queryByText(/UTC/)).toBeNull();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(RUNS.length + 1);
    const partial = within(rows[2]!);
    expect(partial.getByText("partial")).toBeInTheDocument();
    expect(partial.getByText("v2")).toBeInTheDocument();
    expect(partial.getByText("75%")).toBeInTheDocument();
    expect(partial.getByText("50%")).toBeInTheDocument();
    expect(partial.queryByText("0.75")).toBeNull();
    // null citation + null cost render as the empty marker
    expect(partial.getAllByText("—")).toHaveLength(2);
    expect(partial.getByText("3/4")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("$0.014")).toBeInTheDocument();

    // failed and running rows are not selectable
    expect(screen.getByRole("checkbox", { name: "Select run from 2026-10-10 10:00" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select run from 2026-10-09 10:00" })).toBeDisabled();

    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    expect(screen.getByText("Select exactly two finished runs to compare.")).toBeInTheDocument();

    const boxA = screen.getByRole("checkbox", { name: "Select run from 2026-10-12 10:00" });
    const boxB = screen.getByRole("checkbox", { name: "Select run from 2026-10-11 10:00" });
    const boxE = screen.getByRole("checkbox", { name: "Select run from 2026-10-08 10:00" });
    fireEvent.click(boxA);
    expect(compare).toBeDisabled(); // one
    fireEvent.click(boxB);
    expect(compare).toBeEnabled(); // two
    expect(screen.queryByText("Select exactly two finished runs to compare.")).toBeNull();
    fireEvent.click(boxE);
    expect(compare).toBeDisabled(); // three

    fireEvent.click(boxE);
    fireEvent.click(compare);
    expect(onCompare).toHaveBeenCalledWith(["a", "b"]);
  });

  it("shows the Recent runs heading with the selection count and Compare in the heading row (AC-16)", async () => {
    mockFetch({ "GET /agents/ag1/eval-runs": RUNS });
    renderWithProviders(<EvalRunHistory agentId="ag1" onCompare={() => {}} />);
    await screen.findByRole("table");
    const region = screen.getByRole("region", { name: "Recent runs" });
    expect(within(region).getByRole("heading", { name: "Recent runs" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Run history" })).toBeNull();
    const compare = within(region).getByRole("button", { name: "Compare" });
    const heading = within(region).getByRole("heading");
    expect(heading.parentElement!.parentElement!.contains(compare)).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select run from 2026-10-12 10:00" }));
    expect(within(region).getByRole("heading", { name: "Recent runs · 1 selected" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run from 2026-10-11 10:00" }));
    expect(within(region).getByRole("heading", { name: "Recent runs · 2 selected" })).toBeInTheDocument();
    expect(compare).toBeEnabled();
    // running/failed rows are not selectable, so they never count
    expect(screen.getByRole("checkbox", { name: "Select run from 2026-10-09 10:00" })).toBeDisabled();
  });

  it("has the design columns, hidden Select, uppercase captions, and sentence case i18n (AC-13, AC-17)", async () => {
    mockFetch({ "GET /agents/ag1/eval-runs": RUNS });
    renderWithProviders(<EvalRunHistory agentId="ag1" onCompare={() => {}} />);
    await screen.findByRole("table");
    const heads = screen.getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual([
      "Select", "Ran at", "Version", "Status", "Recall", "Precision", "Citation", "Pass", "Cost",
    ]);
    expect(screen.queryByRole("columnheader", { name: "Passed" })).toBeNull();
    expect(screen.getByText("Select").style.position).toBe("absolute");
    expect(heads[1]!.style.textTransform).toBe("uppercase");
    expect(messages.history.columns.ranAt).toMatch(/[a-z]/);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).getByText("3/4")).toBeInTheDocument();
    expect(within(rows[4]!).getAllByText("—").length).toBeGreaterThan(0); // running: no pass count
    expect(within(rows[4]!).queryByText("3/4")).toBeNull();
  });

  it("shows the empty state", async () => {
    mockFetch({ "GET /agents/ag1/eval-runs": [] });
    renderWithProviders(<EvalRunHistory agentId="ag1" onCompare={() => {}} />);
    expect(await screen.findByText("No runs yet. Run the eval to record the first one.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows ErrorState on 500 and Retry re-sends the request", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      return n === 1
        ? new Response(JSON.stringify({ error: { code: "boom", message: "x" } }), { status: 500 })
        : new Response(JSON.stringify([run("a")]), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fn);
    renderWithProviders(<EvalRunHistory agentId="ag1" onCompare={() => {}} />);
    expect(await screen.findByText("Couldn’t load run history")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("helpers", () => {
  it("selects only finished runs and drops stale ids", () => {
    expect(isSelectable({ status: "done" })).toBe(true);
    expect(isSelectable({ status: "partial" })).toBe(true);
    expect(isSelectable({ status: "failed" })).toBe(false);
    expect(isSelectable({ status: "running" })).toBe(false);
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
    expect(effectiveSelection(["a", "gone", "c"], RUNS)).toEqual(["a"]);
  });
});
