import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { EvalDashboardRow, EvalSuiteRun } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import messages from "../../../../../messages/en/eval.json";
import { EvalDashboard } from "./EvalDashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function latest(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "s",
    agent_id: "a",
    agent_version: 1,
    status: "done",
    ran_at: "2026-10-12T09:30:00.000Z",
    finished_at: "2026-10-12T09:31:00.000Z",
    case_ids: [],
    skills: [],
    cases_total: 4,
    cases_completed: 4,
    cases_passed: 3,
    cases_errored: 0,
    recall: 0.5,
    precision: 0.75,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    error: null,
    ...over,
  };
}

const NONE = { recall: null, precision: null, citation_accuracy: null };

// Deliberately NOT alphabetical: the component must keep the server's order.
const ROWS: EvalDashboardRow[] = [
  {
    agent_id: "z1",
    agent_name: "Zed reviewer with a very long name that must truncate",
    cases_total: 5,
    latest: latest({ recall: 0.5, precision: 0.6 }),
    running: true,
    delta: { recall: -0.25, precision: 0.1, citation_accuracy: null },
    drop: true,
  },
  {
    agent_id: "a1",
    agent_name: "<script>alert(1)</script>",
    cases_total: 1,
    latest: latest({ recall: 1, precision: 1, citation_accuracy: 1 }),
    running: false,
    delta: { recall: 0.25, precision: 0, citation_accuracy: null },
    drop: false,
  },
  { agent_id: "n1", agent_name: "Newbie", cases_total: 2, latest: null, running: false, delta: NONE, drop: false },
];

const RECENT_EMPTY = { "GET /eval/recent-runs?limit=50": [] };

describe("EvalDashboard", () => {
  it("shows the design title and subtitle, cards in server order, no column headers (AC-1, AC-2)", async () => {
    mockFetch({ "GET /eval/dashboard": ROWS, ...RECENT_EMPTY });
    renderWithProviders(<EvalDashboard />);
    expect(screen.getByText("Loading eval metrics…")).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 1, name: "Eval Dashboard" })).toBeInTheDocument();
    expect(
      screen.getByText("Regression harness across all reviewer agents · pick an agent to see its runs"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Regressions first, then by agent name")).toBeNull();

    const list = await screen.findByRole("list", { name: "Agents" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Zed reviewer with a very long name that must truncate");
    expect(items[0]).toHaveTextContent("drop");
    expect(items[1]).toHaveTextContent("<script>alert(1)</script>");
    expect(items[2]).toHaveTextContent("Newbie");
    expect(document.querySelector("script")).toBeNull();

    const region = screen.getByRole("region", { name: "Agents" });
    expect(within(region).queryAllByRole("columnheader")).toHaveLength(0);
    const h2 = screen.getByRole("heading", { level: 2, name: "Agents" });
    expect(h2.style.textTransform).toBe("uppercase");
    expect(h2.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    expect(within(items[0]!).getByRole("img", { name: "down 25 pt" })).toBeInTheDocument();
    expect(within(items[2]!).getByText(/Never run · 2 cases/)).toBeInTheDocument();
  });

  it("keeps the captions in sentence case in i18n", () => {
    expect(messages.dashboard.agents.title).toMatch(/[a-z]/);
    expect(messages.dashboard.card.metric.precision).toMatch(/[a-z]/);
  });

  it("sends only the two dashboard GETs (NFR-2)", async () => {
    const calls = mockFetch({ "GET /eval/dashboard": ROWS, ...RECENT_EMPTY });
    renderWithProviders(<EvalDashboard />);
    await screen.findByRole("list", { name: "Agents" });
    await screen.findByText("No finished eval runs yet.");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.map((c) => c.path).sort()).toEqual(["/eval/dashboard", "/eval/recent-runs?limit=50"]);
  });

  it("draws a recall sparkline from the single recent-runs response and none for one point (AC-26, AC-25)", async () => {
    const mk = (id: string, agent_id: string, recall: number | null) => ({
      id,
      agent_id,
      agent_name: "x",
      agent_version: 1,
      status: "done",
      ran_at: "2026-10-12T09:30:00.000Z",
      finished_at: "2026-10-12T09:31:00.000Z",
      case_ids: [],
      skills: [],
      cases_total: 1,
      cases_completed: 1,
      cases_passed: 1,
      cases_errored: 0,
      recall,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
      duration_ms: null,
      error: null,
    });
    const calls = mockFetch({
      "GET /eval/dashboard": ROWS,
      "GET /eval/recent-runs?limit=50": [mk("3", ROWS[0]!.agent_id, 0.82), mk("2", ROWS[0]!.agent_id, 0.75), mk("1", ROWS[0]!.agent_id, 0.7), mk("4", ROWS[1]!.agent_id, 0.5)],
    });
    renderWithProviders(<EvalDashboard />);
    const list = await screen.findByRole("list", { name: "Agents" });
    const items = within(list).getAllByRole("listitem");
    expect(await within(items[0]!).findByRole("img", { name: "Recall trend over 3 runs: from 70% to 82%" })).toBeInTheDocument();
    expect(within(items[0]!).getAllByRole("link")).toHaveLength(1);
    expect(within(items[1]!).queryByRole("img", { name: /trend over/ })).toBeNull();
    expect(calls.map((c) => c.path).sort()).toEqual(["/eval/dashboard", "/eval/recent-runs?limit=50"]);
  });

  it("keeps the cards without sparklines and shows Retry in the recent section when recent-runs fails (AC-27)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/eval/recent-runs")) {
          return new Response(JSON.stringify({ error: { code: "boom", message: "x" } }), { status: 500 });
        }
        return new Response(JSON.stringify(ROWS), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    renderWithProviders(<EvalDashboard />);
    const list = await screen.findByRole("list", { name: "Agents" });
    const recent = await screen.findByRole("region", { name: "Recent eval runs · all agents" });
    expect(await within(recent).findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).queryByRole("img", { name: /trend over/ })).toBeNull();
  });

  it("shows the empty state with a link to /agents", async () => {
    mockFetch({ "GET /eval/dashboard": [], ...RECENT_EMPTY });
    renderWithProviders(<EvalDashboard />);
    expect(await screen.findByText(/No agent has eval cases yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to agents" })).toHaveAttribute("href", "/agents");
  });

  it("shows ErrorState on 500 and Retry re-sends the request", async () => {
    let n = 0;
    const fn = vi.fn(async (url: string) => {
      if (String(url).includes("/eval/recent-runs")) return new Response("[]", { status: 200 });
      n += 1;
      return n === 1
        ? new Response(JSON.stringify({ error: { code: "boom", message: "x" } }), { status: 500 })
        : new Response(JSON.stringify(ROWS), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fn);
    renderWithProviders(<EvalDashboard />);
    expect(await screen.findByText("Couldn’t load the eval dashboard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Newbie")).toBeInTheDocument();
    const dashboardCalls = fn.mock.calls.filter(([u]) => String(u).endsWith("/eval/dashboard"));
    expect(dashboardCalls).toHaveLength(2);
  });
});
