import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import type { Agent, EvalSuiteRun } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { AgentHeader } from "./AgentHeader";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT = { name: "Security Reviewer", provider: "openrouter", model: "gpt-x" } as const;
const ID = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";

function run(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: ID,
    agent_version: 1,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: "2026-10-12T09:30:00.000Z",
    finished_at: "2026-10-12T09:31:00.000Z",
    case_ids: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
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

function setup(runs: EvalSuiteRun[], agent: Pick<Agent, "name" | "provider" | "model"> = AGENT) {
  const calls = mockFetch({
    [`GET /agents/${ID}/eval-cases`]: [],
    [`GET /agents/${ID}/eval-runs`]: runs,
    "GET /eval/dashboard": [],
  });
  renderWithProviders(<AgentHeader agent={agent} runs={runs} agentId={ID} />);
  return calls;
}

describe("AgentHeader", () => {
  it("shows a level-1 heading with the name, a title and ellipsis style, and the mono model chip (AC-1)", () => {
    setup([]);
    const h1 = screen.getByRole("heading", { level: 1, name: "Security Reviewer" });
    expect(h1).toHaveAttribute("title", "Security Reviewer");
    expect(h1.style.whiteSpace).toBe("nowrap");
    expect(h1.style.textOverflow).toBe("ellipsis");
    expect(h1.style.overflow).toBe("hidden");
    expect(h1.style.minWidth).toBe("0");
    const chip = screen.getByText("openrouter/gpt-x");
    expect(chip).toHaveClass("mono");
  });

  it("renders a name with markup literally in the heading and the Evals link name (NFR-3)", () => {
    setup([], { ...AGENT, name: "<script>alert(1)</script>" });
    expect(screen.getByRole("heading", { level: 1, name: "<script>alert(1)</script>" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Evals tab of <script>alert(1)</script>" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("has a back link to /eval with a decorative chevron (AC-6)", () => {
    setup([]);
    const back = screen.getByRole("link", { name: "All agents" });
    expect(back).toHaveAttribute("href", "/eval");
    expect(back.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("links to the agent's Evals tab with a descriptive name (AC-7)", () => {
    setup([]);
    const link = screen.getByRole("link", { name: "Open Evals tab of Security Reviewer" });
    expect(link).toHaveAttribute("href", `/agents/${ID}?tab=evals`);
    expect(link).toHaveTextContent("Open Evals tab");
  });

  it("keeps the controls in a non-shrinking group next to the shrinking title (EC-8)", () => {
    setup([]);
    const h1 = screen.getByRole("heading", { level: 1 });
    const titleCol = h1.parentElement!.parentElement!;
    expect(titleCol.style.minWidth).toBe("0");
    expect(titleCol.style.flexShrink).toBe("1");
    const link = screen.getByRole("link", { name: /Open Evals tab of/ });
    expect(link.parentElement!.style.flexShrink).toBe("0");
  });

  it("states the case set when every finished run shares it (AC-8)", () => {
    const runs = [1, 2, 3, 4, 5].map((n) => run(`r${n}`, { agent_version: n }));
    setup(runs);
    expect(screen.getByText("Regression harness · 5 runs on the 8-case set")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/20-trace|gold set/);
  });

  it("uses the singular for one run and does not count running or failed runs", () => {
    setup([run("a"), run("b", { status: "running", case_ids: ["x"] }), run("c", { status: "failed", case_ids: ["y"] })]);
    expect(screen.getByText("Regression harness · 1 run on the 8-case set")).toBeInTheDocument();
  });

  it("says different case sets, and none without finished runs", () => {
    setup([run("a"), run("b", { case_ids: ["z"] })]);
    expect(screen.getByText("Regression harness · 2 runs on different case sets")).toBeInTheDocument();
    cleanup();
    setup([run("a", { status: "running" })]);
    expect(screen.getByText("Regression harness · no finished runs yet")).toBeInTheDocument();
  });

  it("shows no subtitle while the history is unavailable", () => {
    mockFetch({ "GET /eval/dashboard": [] });
    renderWithProviders(<AgentHeader agent={AGENT} runs={undefined} agentId={ID} />);
    expect(screen.queryByText(/Regression harness/)).toBeNull();
  });

  it("contains the run control and the switcher once the dashboard answered (AC-9, AC-11)", async () => {
    setup([run("a")]);
    expect(await screen.findByRole("combobox", { name: "Switch agent" })).toBeInTheDocument();
    expect(within(document.body).getByRole("button", { name: /Run eval/ })).toBeInTheDocument();
  });
});
