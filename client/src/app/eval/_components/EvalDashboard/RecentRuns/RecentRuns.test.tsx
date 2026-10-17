import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { EvalDashboardRow, EvalRecentRun } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { EvalDashboard } from "../EvalDashboard";
import { RecentRuns } from "./RecentRuns";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function run(id: string, over: Partial<EvalRecentRun> = {}): EvalRecentRun {
  return {
    id,
    agent_id: `ag-${id}`,
    agent_name: `Agent ${id}`,
    agent_version: 3,
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
    cases_passed: 7,
    cases_errored: 0,
    recall: 0.75,
    precision: 0.5,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    error: null,
    ...over,
  };
}

const URL = "GET /eval/recent-runs?limit=50";

describe("RecentRuns", () => {
  it("lists the runs in the server's order with percent bars, links, partial label and plain-text names", async () => {
    const calls = mockFetch({
      [URL]: [
        run("b", { agent_name: "Zed" }),
        run("a", { agent_name: "<script>alert(1)</script>", status: "partial", agent_version: 5, ran_at: "2026-10-11T08:00:00.000Z" }),
      ],
    });
    renderWithProviders(<RecentRuns />);
    expect(screen.getByText("Loading recent eval runs…")).toBeInTheDocument();

    const section = await screen.findByRole("region", { name: "Recent eval runs · all agents" });
    const rows = (await within(section).findAllByRole("row")).slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    const second = within(rows[1]!);

    // order is the server's, not alphabetical
    expect(first.getByRole("link", { name: "Zed" })).toHaveAttribute("href", "/eval/ag-b");
    expect(second.getByRole("link", { name: "<script>alert(1)</script>" })).toHaveAttribute("href", "/eval/ag-a");
    expect(document.querySelector("script")).toBeNull();
    expect(first.getByRole("link", { name: "Zed" }).style.textOverflow).toBe("ellipsis");
    expect(first.getByRole("link", { name: "Zed" })).toHaveAttribute("title", "Zed");

    const cells = (i: number) => within(rows[i]!).getAllByRole("cell").map((c) => c.textContent);
    expect(cells(0)).toEqual(["Zed", "2026-10-12 09:30", "v3", "75%", "50%", "—", "7/8"]);
    expect(cells(1)[2]).toBe("v5");
    expect(cells(1)[6]).toBe("7/8partial");
    expect(first.queryByText("partial")).toBeNull();
    expect(second.getByText("partial")).toBeInTheDocument();

    // bars: decorative, one per non-null value, none for null
    const bars = rows[0]!.querySelectorAll<HTMLElement>("[data-metric-bar]");
    expect(bars).toHaveLength(2); // recall and precision; citation is null
    expect(bars[0]!.style.width).toBe("75%");
    expect(bars[1]!.style.width).toBe("50%");
    expect(bars[0]!.style.background).toBe("var(--accent)");
    expect(bars[1]!.style.background).toBe("var(--ok)");
    expect(bars[0]!.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(cells(0)[5]).toBe("—");

    // bold n/m, plain-text accent version, local time with a UTC tooltip, no visible UTC
    expect(first.getByText("7/8").tagName).toBe("STRONG");
    expect(first.queryByRole("link", { name: "v3" })).toBeNull();
    expect(first.getByText("v3").style.textDecoration).toBe("");
    expect(first.getByTitle("2026-10-12 09:30 UTC")).toBeInTheDocument();
    expect(rows[0]!.textContent).not.toContain("UTC");

    // headers stay in the accessibility tree, visually hidden
    expect(within(section).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Agent", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass",
    ]);
    const headRow = section.querySelector("thead tr") as HTMLElement;
    expect(headRow.style.position).toBe("absolute");
    expect(headRow.style.clip).toBe("rect(0px, 0px, 0px, 0px)");
    const h2 = within(section).getByRole("heading", { level: 2 });
    expect(h2.style.textTransform).toBe("uppercase");
    expect(h2.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([URL]);
  });

  it("shows the empty text, and an error state whose Retry re-sends only the recent GET", async () => {
    mockFetch({ [URL]: [] });
    renderWithProviders(<RecentRuns />);
    expect(await screen.findByText("No finished eval runs yet.")).toBeInTheDocument();
    cleanup();

    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      return n === 1
        ? new Response(JSON.stringify({ error: { code: "boom", message: "x" } }), { status: 500 })
        : new Response(JSON.stringify([run("a")]), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fn);
    renderWithProviders(<RecentRuns />);
    expect(await screen.findByText("Couldn’t load recent eval runs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Agent a" })).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("EvalDashboard sections are independent", () => {
  const AGENT: EvalDashboardRow = {
    agent_id: "a1",
    agent_name: "Alpha",
    cases_total: 2,
    latest: null,
    running: false,
    delta: { recall: null, precision: null, citation_accuracy: null },
    drop: false,
  };

  it("keeps the agent rows when the recent list is empty, and shows recent rows when there are no agents", async () => {
    mockFetch({ "GET /eval/dashboard": [AGENT], [URL]: [] });
    renderWithProviders(<EvalDashboard />);
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(await screen.findByText("No finished eval runs yet.")).toBeInTheDocument();
    cleanup();

    mockFetch({ "GET /eval/dashboard": [], [URL]: [run("a")] });
    renderWithProviders(<EvalDashboard />);
    expect(await screen.findByText(/No agent has eval cases yet/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Agent a" })).toBeInTheDocument();
  });

  it("requests 50 and shows only the first 10 items, in the server's order (AC-25)", async () => {
    const items = Array.from({ length: 14 }, (_, i) => run(String(i + 1), { agent_name: `Agent ${i + 1}` }));
    const calls = mockFetch({ [URL]: items });
    renderWithProviders(<RecentRuns />);
    const section = await screen.findByRole("region", { name: "Recent eval runs · all agents" });
    const rows = (await within(section).findAllByRole("row")).slice(1);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => within(r).getAllByRole("link")[0]!.textContent)).toEqual(
      items.slice(0, 10).map((i) => i.agent_name),
    );
    expect(calls.map((c) => c.path)).toEqual(["/eval/recent-runs?limit=50"]);
  });

  it("keeps the agent rows when the recent request fails, and Retry re-sends only /eval/recent-runs", async () => {
    const paths: string[] = [];
    let recentHits = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        paths.push(`${(init?.method ?? "GET").toUpperCase()} ${path}`);
        const ok = (body: unknown) =>
          new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        if (path === "/eval/dashboard") return ok([AGENT]);
        recentHits += 1;
        return recentHits === 1
          ? new Response(JSON.stringify({ error: { code: "boom", message: "x" } }), { status: 500 })
          : ok([run("a")]);
      }),
    );
    renderWithProviders(<EvalDashboard />);
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    const section = await screen.findByRole("region", { name: "Recent eval runs · all agents" });
    const retry = await within(section).findByRole("button", { name: "Retry" });
    const before = paths.length;

    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: "Agent a" })).toBeInTheDocument();
    expect(paths.slice(before)).toEqual([URL]);
    expect(paths.filter((p) => !p.startsWith("GET "))).toEqual([]);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});
