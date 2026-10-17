import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { EvalRunRecord, EvalSuiteRunDetail } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { EvalCompare } from "./EvalCompare";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function rec(case_id: string, outcome: "passed" | "failed" | "error", name: string): EvalRunRecord {
  return {
    id: `r-${case_id}`,
    case_id,
    case_name: name,
    suite_run_id: "s",
    ran_at: "2026-10-12T00:00:00.000Z",
    actual_output: {
      kept: [],
      dropped: [],
      outcome,
      expectation_kind: "must_find",
      matched: null,
      findings_kept: null,
      findings_dropped: null,
      error: null,
    },
    pass: outcome === "passed",
    outcome,
    expectation_kind: "must_find",
    findings_kept: null,
    findings_dropped: null,
    matched: null,
    error: null,
    recall: null,
    precision: null,
    citation_accuracy: null,
    duration_ms: 2500,
    cost_usd: 0.002,
  };
}

function detail(over: Partial<EvalSuiteRunDetail>): EvalSuiteRunDetail {
  return {
    id: "x",
    agent_id: "ag1",
    agent_version: 1,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: "2026-10-12T00:00:00.000Z",
    finished_at: "2026-10-12T00:01:00.000Z",
    case_ids: [],
    skills: [],
    cases_total: 0,
    cases_completed: 0,
    cases_passed: 0,
    cases_errored: 0,
    recall: null,
    precision: null,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    error: null,
    cases: [],
    ...over,
  };
}

const OLD = detail({
  id: "old",
  agent_version: 1,
  ran_at: "2026-10-10T10:00:00.000Z",
  skills: ["security"],
  case_ids: ["c1", "c2", "c3"],
  recall: 0.5,
  precision: 0.75,
  citation_accuracy: null,
  cases: [rec("c1", "passed", "same case"), rec("c2", "passed", "<script>alert(1)</script>")],
});
const NEW = detail({
  id: "new",
  agent_version: 2,
  ran_at: "2026-10-12T10:00:00.000Z",
  case_ids: ["c1", "c2", "c4"],
  recall: 0.75,
  precision: 0.65,
  citation_accuracy: 1,
  cases: [rec("c1", "passed", "same case"), rec("c2", "failed", "<script>alert(1)</script>"), rec("c4", "error", "added later")],
});

function version(v: number, prompt: string) {
  return { agent_id: "ag1", version: v, created_at: "x", config: { system_prompt: prompt } };
}

/** fetch stub: path -> { status, body }. */
function stub(routes: Record<string, { status?: number; body: unknown; gate?: Promise<void> }>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      calls.push(`${(init?.method ?? "GET").toUpperCase()} ${path}`);
      const r = routes[path];
      if (!r) return new Response("{}", { status: 404 });
      if (r.gate) await r.gate;
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const nonGet = (calls: string[]) => calls.filter((c) => !c.startsWith("GET "));

describe("EvalCompare", () => {
  it("opens a dialog at body level showing A (older) and B (newer), a case-set notice, changed rows first and the diff legend", async () => {
    const calls = stub({
      "/eval-runs/new": { body: NEW },
      "/eval-runs/old": { body: OLD },
      "/agents/ag1/versions/1": { body: version(1, "Be strict.\nCheck auth.") },
      "/agents/ag1/versions/2": { body: version(2, "Be strict.\nCheck authz.\nCite lines.") },
    });
    // given in newest-first order: component must still put the older run in column A
    const { container } = renderWithProviders(<EvalCompare agentId="ag1" runIds={["new", "old"]} onClose={() => {}} />);

    // AC-4: portalled out of the RTL container, ancestors end at document.body
    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    let node: HTMLElement | null = dialog;
    while (node && node.parentElement !== document.body) node = node.parentElement;
    expect(node?.parentElement).toBe(document.body);

    // AC-5: name while loading, then with versions, plus the subtitle
    expect(await screen.findByRole("dialog", { name: "Compare runs · v1 → v2" })).toBe(dialog);
    expect(screen.getByText("Old prompt vs new — metric deltas and prompt diff on different case sets")).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/20-trace|gold set/);
    expect(screen.getByText("System prompt diff").style.textTransform).toBe("uppercase");
    expect(screen.getByText("Metrics are over different case sets")).toBeInTheDocument();

    // AC-6: tiles in the percent / point-delta format, direction as text and name
    const tiles = within(screen.getByRole("group", { name: "Metric comparison" }));
    const tile = (label: string) => tiles.getByText(label).parentElement!;
    expect(tile("Recall")).toHaveTextContent("50% → 75%");
    expect(within(tile("Recall")).getByRole("img", { name: "up 25 pt" })).toHaveTextContent("▲ 25 pt");
    expect(tile("Precision")).toHaveTextContent("75% → 65%");
    expect(within(tile("Precision")).getByRole("img", { name: "down 10 pt" })).toHaveTextContent("▼ 10 pt");
    // null side: "—" and no direction glyph
    expect(tile("Citation")).toHaveTextContent("— → 100%");
    expect(within(tile("Citation")).queryByRole("img")).toBeNull();
    expect(tile("Citation").textContent).not.toMatch(/[▲▼]/);
    // no two-decimal metric text anywhere in the dialog (AC-8)
    expect(dialog.textContent).not.toContain("0.75");
    expect(dialog.textContent).not.toContain("+0.25");

    // run info keeps ran_at / version / skills
    const info = screen.getByRole("table", { name: "Run details" });
    const row = (name: string) => within(within(info).getByRole("rowheader", { name }).closest("tr")!);
    expect(row("Ran at").getAllByRole("cell")[0]).toHaveTextContent("2026-10-10 10:00");
    expect(row("Ran at").getByTitle("2026-10-10 10:00 UTC")).toBeInTheDocument();
    expect(row("Ran at").getAllByRole("cell")[0]!.textContent).not.toContain("UTC");
    expect(tiles.getByText("Recall").style.textTransform).toBe("uppercase");
    expect(row("Agent version").getAllByRole("cell")[0]).toHaveTextContent("v1");
    expect(row("Skills").getAllByRole("cell")[0]).toHaveTextContent("security");
    expect(row("Skills").getAllByRole("cell")[1]).toHaveTextContent("none");

    // per-case table: c2 (passed -> failed), c3 (deleted -> not in run), c4 (not in run -> error) first; c1 last
    const table = screen.getByRole("table", { name: "Cases" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    const cells = (i: number) => within(rows[i]!).getAllByRole("cell").map((c) => c.textContent);
    expect(cells(0)[0]).toBe("<script>alert(1)</script>changed");
    expect(cells(0).slice(1, 3)).toEqual(["passed", "failed"]);
    expect(cells(1)).toEqual(["c3changed", "case deleted", "not in run", "—", "—", "—", "—"]);
    expect(cells(2)[0]).toBe("added laterchanged");
    expect(cells(2).slice(1, 3)).toEqual(["not in run", "error"]);
    expect(cells(3)).toEqual(["same case", "passed", "passed", "2.5s", "$0.002", "2.5s", "$0.002"]);
    // the script title is plain text, no element created
    expect(document.querySelector("script")).toBeNull();
    expect(within(rows[0]!).getByTitle("<script>alert(1)</script>").style.textOverflow).toBe("ellipsis");

    // AC-9: prompt diff collapsed, no legend; expanded shows the legend and the +/− markers
    const toggle = await screen.findByRole("button", { name: "Show diff" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("v1 (old)")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide diff" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("v1 (old)")).toBeInTheDocument();
    expect(screen.getByText("v2 (new)")).toBeInTheDocument();
    const lines = screen.getAllByRole("listitem").filter((li) => li.className === "" && /Check|Be strict|Cite/.test(li.textContent ?? ""));
    expect(lines.map((l) => l.textContent)).toEqual([" Be strict.", "−Check auth.", "+Check authz.", "+Cite lines."]);
    expect(nonGet(calls)).toEqual([]);
  });

  it("names the dialog 'Compare runs' before the runs resolve, and 'v3 → v3' for equal versions", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const calls = stub({
      "/eval-runs/a": { body: { ...OLD, id: "a", agent_version: 3 }, gate },
      "/eval-runs/b": { body: { ...OLD, id: "b", agent_version: 3, ran_at: "2026-10-11T10:00:00.000Z" }, gate },
    });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Compare runs" })).toBeInTheDocument();
    expect(screen.queryByText(/Old prompt vs new/)).toBeNull();
    release();
    expect(await screen.findByRole("dialog", { name: "Compare runs · v3 → v3" })).toBeInTheDocument();
    // AC-19: equal case sets name their count
    expect(
      screen.getByText(`Old prompt vs new — metric deltas and prompt diff on the ${OLD.case_ids.length}-case set`),
    ).toBeInTheDocument();
    // AC-8 / EC-11: same version → same prompt, no versions fetched, no notice for equal case sets
    expect(screen.getByText("Same system prompt")).toBeInTheDocument();
    expect(screen.queryByText("Metrics are over different case sets")).toBeNull();
    expect(calls.some((c) => c.includes("/versions/"))).toBe(false);
    expect(screen.queryByRole("button", { name: "Show diff" })).toBeNull();
  });

  it("says 'Same system prompt' when versions differ but prompts are identical", async () => {
    stub({
      "/eval-runs/old": { body: OLD },
      "/eval-runs/new": { body: { ...NEW, case_ids: OLD.case_ids } },
      "/agents/ag1/versions/1": { body: version(1, "same") },
      "/agents/ag1/versions/2": { body: version(2, "same") },
    });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["old", "new"]} onClose={() => {}} />);
    expect(await screen.findByText("Same system prompt")).toBeInTheDocument();
  });

  it("shows the cost tile: signed difference, flat, null sides and a genuine zero", async () => {
    const run = (id: string, cost: number | null, at: string) => ({ ...OLD, id, cost_usd: cost, ran_at: at });
    const cost = () => within(screen.getByRole("group", { name: "Metric comparison" })).getByText("Cost").parentElement!;

    stub({
      "/eval-runs/a": { body: run("a", 0.04, "2026-10-10T00:00:00.000Z") },
      "/eval-runs/b": { body: run("b", 0.06, "2026-10-11T00:00:00.000Z") },
    });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={() => {}} />);
    await screen.findByRole("group", { name: "Metric comparison" });
    expect(cost()).toHaveTextContent("$0.04 → $0.06");
    expect(cost()).toHaveTextContent("▲ +$0.02");
    // a higher bill is the bad direction: critical colour, not the "ok" green
    expect(within(cost()).getByText("▲ +$0.02").getAttribute("style")).toContain("--crit");
    cleanup();

    stub({
      "/eval-runs/a": { body: run("a", 0.05, "2026-10-10T00:00:00.000Z") },
      "/eval-runs/b": { body: run("b", 0.05, "2026-10-11T00:00:00.000Z") },
    });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={() => {}} />);
    await screen.findByRole("group", { name: "Metric comparison" });
    expect(cost()).toHaveTextContent("$0.05 → $0.05");
    expect(cost().textContent).toContain("$0.00");
    expect(cost().textContent).not.toMatch(/[▲▼]/);
    cleanup();

    stub({
      "/eval-runs/a": { body: run("a", null, "2026-10-10T00:00:00.000Z") },
      "/eval-runs/b": { body: run("b", 0.06, "2026-10-11T00:00:00.000Z") },
    });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={() => {}} />);
    await screen.findByRole("group", { name: "Metric comparison" });
    expect(cost()).toHaveTextContent("— → $0.06");
    expect(cost().textContent).toMatch(/— → \$0\.06—$/);
    cleanup();

    stub({
      "/eval-runs/a": { body: run("a", 0.06, "2026-10-10T00:00:00.000Z") },
      "/eval-runs/b": { body: run("b", 0.05, "2026-10-11T00:00:00.000Z") },
    });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={() => {}} />);
    await screen.findByRole("group", { name: "Metric comparison" });
    expect(cost()).toHaveTextContent("▼ −$0.01");
    cleanup();

    stub({
      "/eval-runs/a": { body: run("a", 0, "2026-10-10T00:00:00.000Z") },
      "/eval-runs/b": { body: run("b", 0, "2026-10-11T00:00:00.000Z") },
    });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={() => {}} />);
    await screen.findByRole("group", { name: "Metric comparison" });
    expect(cost()).toHaveTextContent("$0.00 → $0.00");
  });

  it("closes from the footer button, the X, Escape and the backdrop, sending only GETs", async () => {
    const calls = stub({ "/eval-runs/a": { body: OLD }, "/eval-runs/b": { body: OLD } });
    const onClose = vi.fn();
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={onClose} />);
    await screen.findByRole("group", { name: "Metric comparison" });

    const closes = screen.getAllByRole("button", { name: "Close" });
    expect(closes).toHaveLength(2); // vendored X, then the footer button
    fireEvent.click(closes[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(closes[0]!);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("dialog").previousElementSibling!);
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(nonGet(calls)).toEqual([]);
  });

  it("shows ErrorState inside the dialog, Retry re-sends only the failed GET, and Close stays usable", async () => {
    const hits: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        hits.push(path);
        if (path === "/eval-runs/b" && hits.filter((h) => h === path).length === 1) {
          return new Response(JSON.stringify({ error: { code: "boom", message: "x" } }), { status: 500 });
        }
        return new Response(JSON.stringify({ ...OLD, id: path.endsWith("b") ? "b" : "a" }), { status: 200 });
      }),
    );
    const onClose = vi.fn();
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Couldn’t load the runs")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Metric comparison" })).toBeNull();
    const before = hits.length;

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("group", { name: "Metric comparison" })).toBeInTheDocument();
    expect(hits.slice(before)).toEqual(["/eval-runs/b"]);

    // and with the error state showing, Close works
    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={onClose} />);
    await screen.findByText("Couldn’t load the runs");
    const closes = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closes[closes.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("holds focus on the dialog while loading, then on the footer Close, and wraps Tab inside", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    stub({ "/eval-runs/a": { body: OLD, gate }, "/eval-runs/b": { body: OLD, gate } });
    renderWithProviders(<EvalCompare agentId="ag1" runIds={["a", "b"]} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());

    release();
    await screen.findByRole("group", { name: "Metric comparison" });
    const closes = screen.getAllByRole("button", { name: "Close" });
    const footerClose = closes[closes.length - 1]!;
    await waitFor(() => expect(footerClose).toHaveFocus());

    // Tab from the last control wraps to the first (the X); Shift+Tab goes back
    fireEvent.keyDown(footerClose, { key: "Tab" });
    expect(closes[0]).toHaveFocus();
    fireEvent.keyDown(closes[0]!, { key: "Tab", shiftKey: true });
    expect(footerClose).toHaveFocus();
  });
});
