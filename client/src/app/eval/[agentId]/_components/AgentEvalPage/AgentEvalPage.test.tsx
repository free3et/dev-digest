import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRun, EvalSuiteRunDetail } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import { mockFetch } from "@/test/render";
import evalMessages from "../../../../../../messages/en/eval.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { AgentEvalPage, useAgentEvalPage } from ".";

const ID = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";
const AGENT = { id: ID, name: "Security Reviewer", provider: "openrouter", model: "gpt-x" };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* Same QueryClient defaults as production (`lib/providers.tsx`: staleTime 30 s,
   no window-focus refetch). The shared test renderer uses staleTime 0, under
   which every part mounting after the agent arrives would refetch the runs and
   cases, and "each GET once" (NFR-2) could not be asserted. */
function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function Harness({ id = ID }: { id?: string }) {
  return <AgentEvalPage view={useAgentEvalPage(id)} />;
}

function suite(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: ID,
    agent_version: 1,
    status: "done",
    ran_at: "2026-10-10T10:00:00.000Z",
    finished_at: "2026-10-10T10:01:00.000Z",
    case_ids: ["c1", "c2", "c3"],
    skills: [],
    cases_total: 3,
    cases_completed: 3,
    cases_passed: 3,
    cases_errored: 0,
    recall: 0.7,
    precision: 0.8,
    citation_accuracy: 0.9,
    cost_usd: 0.01,
    duration_ms: 1000,
    error: null,
    ...over,
  };
}

const CASES = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];
const V6 = suite("r6", { agent_version: 6, ran_at: "2026-10-10T10:00:00.000Z" });
const V7 = suite("r7", { agent_version: 7, ran_at: "2026-10-12T10:00:00.000Z", recall: 0.82, precision: 0.78 });

function routes(extra: Record<string, unknown> = {}) {
  return {
    [`GET /agents/${ID}`]: AGENT,
    [`GET /agents/${ID}/eval-runs`]: [V7, V6],
    [`GET /agents/${ID}/eval-cases`]: CASES,
    "GET /eval/dashboard": [],
    ...extra,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const err = (status: number) => json({ error: { code: status === 404 ? "not_found" : "boom", message: "x" } }, status);

describe("AgentEvalPage", () => {
  it("shows header, banner, cards, trend and history for an existing agent (AC-1, AC-12, AC-13)", async () => {
    mockFetch(routes());
    renderWithProviders(<Harness />);
    expect(screen.getByText("Loading agent…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Security Reviewer" })).toBeInTheDocument();
    expect(await screen.findByText("Regression harness · 2 runs on the 3-case set")).toBeInTheDocument();
    const banner = await screen.findByRole("note", { name: "Regression" });
    expect(banner).toHaveTextContent("Precision dipped 2 pts on v7.");
    expect(screen.getAllByText("82%").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Metric trend" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Recent runs" })).toBeInTheDocument();
  });

  it("shows not-found when GET /agents/:id answers 404 (AC-3)", async () => {
    mockFetch(routes({ [`GET /agents/${ID}`]: undefined }));
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All agents" })).toHaveAttribute("href", "/eval");
  });

  it("replaces a rendered page with not-found when a later eval-runs refetch answers 404 (AC-3, EC-9)", async () => {
    let runsHits = 0;
    const posts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST") {
          posts.push(path);
          return json({ ...suite("new", { status: "running" }), cases: [] });
        }
        if (path === `/agents/${ID}`) return json(AGENT);
        if (path === `/agents/${ID}/eval-cases`) return json(CASES);
        if (path === "/eval/dashboard") return json([]);
        if (path === `/agents/${ID}/eval-runs`) {
          runsHits += 1;
          return runsHits === 1 ? json([V7, V6]) : err(404);
        }
        if (path === "/eval-runs/new") return json({ ...suite("new", { status: "running" }), cases: [] });
        return err(404);
      }),
    );
    renderWithProviders(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Run eval (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
    expect(posts).toEqual([`/agents/${ID}/eval-runs`]);
    expect(screen.queryByRole("heading", { level: 1, name: "Security Reviewer" })).toBeNull();
  });

  it("shows ErrorState on a 500 and Retry re-sends GET /agents/:id (AC-4)", async () => {
    let agentHits = 0;
    const paths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        paths.push(path);
        if (path === `/agents/${ID}`) {
          agentHits += 1;
          return agentHits === 1 ? err(500) : json(AGENT);
        }
        if (path === `/agents/${ID}/eval-runs`) return json([]);
        if (path === `/agents/${ID}/eval-cases`) return json(CASES);
        if (path === "/eval/dashboard") return json([]);
        return err(404);
      }),
    );
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Couldn't load this agent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Security Reviewer" })).toBeInTheDocument();
    expect(paths.filter((p) => p === `/agents/${ID}`)).toHaveLength(2);
  });

  it("confirms before a paid run: dialog without POST, Cancel without POST, Confirm sends exactly one (AC-11, NFR-4)", async () => {
    const calls = mockFetch(
      routes({
        [`POST /agents/${ID}/eval-runs`]: suite("new", { status: "running" }),
        "GET /eval-runs/new": { ...suite("new", { status: "running" }), cases: [] },
      }),
    );
    renderWithProviders(<Harness />);
    const run = await screen.findByRole("button", { name: "Run eval (3)" });
    fireEvent.click(run);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Run eval (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`)).toEqual([
      `POST /agents/${ID}/eval-runs`,
    ]);
  });

  it("selects two runs and opens Compare; Close keeps both ticked (AC-21)", async () => {
    mockFetch(
      routes({
        "GET /eval-runs/r6": { ...V6, cases: [] } satisfies EvalSuiteRunDetail,
        "GET /eval-runs/r7": { ...V7, cases: [] } satisfies EvalSuiteRunDetail,
        [`GET /agents/${ID}/versions/6`]: { agent_id: ID, version: 6, created_at: "x", config: { system_prompt: "a" } },
        [`GET /agents/${ID}/versions/7`]: { agent_id: ID, version: 7, created_at: "x", config: { system_prompt: "b" } },
      }),
    );
    renderWithProviders(<Harness />);
    const tickNew = await screen.findByRole("checkbox", { name: "Select run from 2026-10-12 10:00" });
    fireEvent.click(tickNew);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run from 2026-10-10 10:00" }));
    expect(await screen.findByRole("heading", { name: "Recent runs · 2 selected" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = await screen.findByRole("dialog", { name: "Compare runs · v6 → v7" });
    const closes = within(dialog).getAllByRole("button", { name: "Close" });
    fireEvent.click(closes[closes.length - 1]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select run from 2026-10-12 10:00" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select run from 2026-10-10 10:00" })).toBeChecked();
  });

  it("shows the no-cases block instead of cards and trend, with Run eval (0) disabled (AC-22)", async () => {
    mockFetch(routes({ [`GET /agents/${ID}/eval-cases`]: [], [`GET /agents/${ID}/eval-runs`]: [] }));
    renderWithProviders(<Harness />);
    expect(await screen.findByText("This agent has no eval cases yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add cases in the Evals tab" })).toHaveAttribute(
      "href",
      `/agents/${ID}?tab=evals`,
    );
    expect(screen.queryByRole("heading", { name: "Metric trend" })).toBeNull();
    expect(screen.queryByText("Citation accuracy")).toBeNull();
    expect(await screen.findByRole("button", { name: "Run eval (0)" })).toBeDisabled();
  });

  it("shows one loading text for the runs instead of a 'No finished runs yet.' flash (F8)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        if (path === `/agents/${ID}`) return json(AGENT);
        if (path === `/agents/${ID}/eval-cases`) return json(CASES);
        if (path === "/eval/dashboard") return json([]);
        if (path === `/agents/${ID}/eval-runs`) {
          await gate;
          return json([V7, V6]);
        }
        return err(404);
      }),
    );
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Loading runs…")).toBeInTheDocument();
    expect(screen.queryByText("No finished runs yet.")).toBeNull();
    expect(screen.queryByText(/Regression harness/)).toBeNull();
    release();
    expect(await screen.findByRole("heading", { name: "Metric trend" })).toBeInTheDocument();
    expect(screen.queryByText("Loading runs…")).toBeNull();
  });

  it("renders cards and trend from an empty history, without a subtitle, when the runs fail with 500 (F8, EC-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        if (path === `/agents/${ID}`) return json(AGENT);
        if (path === `/agents/${ID}/eval-cases`) return json(CASES);
        if (path === "/eval/dashboard") return json([]);
        return err(500);
      }),
    );
    renderWithProviders(<Harness />);
    expect(await screen.findByText("No finished runs yet.")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText(/Regression harness/)).toBeNull();
    expect(screen.queryByRole("note", { name: "Regression" })).toBeNull();
  });

  it("sends exactly the four page GETs once each and nothing else (NFR-2, NFR-4)", async () => {
    const calls = mockFetch(routes());
    renderWithProviders(<Harness />);
    await screen.findByRole("heading", { name: "Metric trend" });
    await screen.findByRole("heading", { name: "Recent runs" });
    await screen.findByRole("combobox", { name: "Switch agent" });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.map((c) => c.path).sort()).toEqual(
      [
        `/agents/${ID}`,
        `/agents/${ID}/eval-cases`,
        `/agents/${ID}/eval-runs`,
        "/eval/dashboard",
      ].sort(),
    );
  });

  it("sends nothing and shows not-found for an invalid id (AC-2)", async () => {
    const calls = mockFetch(routes());
    renderWithProviders(<Harness id="../../x" />);
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(0);
  });
});
