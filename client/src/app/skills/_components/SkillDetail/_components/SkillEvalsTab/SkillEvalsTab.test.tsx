import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { EvalSuiteRun, Skill } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { SkillDetail } from "../../SkillDetail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SKILL: Skill = {
  id: "s1",
  name: "test-quality",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 3,
};

const agent = (id: string, name: string, model: string) => ({ id, name, model });
const AGENTS = [agent("h1", "Reviewer A", "gpt-x"), agent("h2", "Reviewer B", "gpt-y")];

const kase = (id: string, file: string, line: number) => ({
  id,
  owner_kind: "skill",
  owner_id: "s1",
  name: `${file}:${line} title`,
  input_diff: "",
  input_files: [file],
  input_meta: { pr_number: 1, pr_title: "t", pr_body: null, repo: "o/r" },
  expected_output: { kind: "must_find", file, start_line: line, end_line: line, title: "t", severity: "WARNING", category: "security", source: null },
  notes: null,
});
const CASES = [kase("c1", "src/a.ts", 12)];

function suite(id: string, agentId: string, ranAt: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    owner_kind: "skill",
    agent_id: agentId,
    agent_version: 2,
    skill_id: "s1",
    skill_version: 3,
    status: "done",
    ran_at: ranAt,
    finished_at: ranAt,
    case_ids: ["c1"],
    skills: [],
    cases_total: 1,
    cases_completed: 1,
    cases_passed: 1,
    cases_errored: 0,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    cost_usd: 0.01,
    duration_ms: 10,
    error: null,
    ...over,
  };
}

const stats = (ids: string[]) => ({ agents: ids.map((id) => ({ id, name: id, enabled: true })) });

function renderTab() {
  return renderWithProviders(<SkillDetail skill={SKILL} tab="evals" onTabChange={() => {}} onAskDelete={() => {}} />);
}

describe("SkillEvalsTab (through SkillDetail)", () => {
  it("presets the host: newest suite's agent, else the first linked agent, else none (AC-5)", async () => {
    // 1. the newest suite's agent
    mockFetch({
      "GET /agents": AGENTS,
      "GET /skills/s1/eval-cases": CASES,
      "GET /skills/s1/eval-runs": [suite("r2", "h2", "2026-10-12T10:00:00Z"), suite("r1", "h1", "2026-10-11T10:00:00Z")],
      "GET /skills/s1/stats": stats(["h1"]),
    });
    renderTab();
    const picker = await screen.findByRole("combobox", { name: "Host agent" });
    await waitFor(() => expect(picker).toHaveValue("h2"));
    cleanup();

    // 2. the suite's agent is gone: first linked agent
    mockFetch({
      "GET /agents": AGENTS,
      "GET /skills/s1/eval-cases": CASES,
      "GET /skills/s1/eval-runs": [suite("r1", "gone", "2026-10-11T10:00:00Z")],
      "GET /skills/s1/stats": stats(["h2", "h1"]),
    });
    renderTab();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Host agent" })).toHaveValue("h2"));
    cleanup();

    // 3. nothing to preselect
    mockFetch({ "GET /agents": AGENTS, "GET /skills/s1/eval-cases": CASES, "GET /skills/s1/eval-runs": [], "GET /skills/s1/stats": stats([]) });
    renderTab();
    const none = await screen.findByRole("combobox", { name: "Host agent" });
    await waitFor(() => expect(within(none).getAllByRole("option")).toHaveLength(3));
    expect(none).toHaveValue("");
  });

  it("with no agents, running is disabled everywhere and the hint is shown (AC-6)", async () => {
    mockFetch({ "GET /agents": [], "GET /skills/s1/eval-cases": CASES, "GET /skills/s1/eval-runs": [], "GET /skills/s1/stats": stats([]) });
    renderTab();
    const run = await screen.findByRole("button", { name: "Run all evals" });
    expect(await screen.findAllByText("Pick an agent to run this skill's evals")).not.toHaveLength(0);
    expect(run).toBeDisabled();
    expect(screen.getByRole("button", { name: /Run eval case “src\/a.ts:12/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run on evals" })).toBeDisabled();
  });

  it("row Run carries the selected host's agent_id (AC-7)", async () => {
    const calls = mockFetch({
      "GET /agents": AGENTS,
      "GET /skills/s1/eval-cases": CASES,
      "GET /skills/s1/eval-runs": [suite("r1", "h1", "2026-10-11T10:00:00Z")],
      "GET /skills/s1/stats": stats([]),
      "POST /eval-cases/c1/run": { outcome: "passed", pass: true, expectation_kind: "must_find", matched: true, matched_count: 1, findings_kept: 1, findings_dropped: 0, kept: [], dropped: [], duration_ms: 1, cost_usd: 0, agent_version: 2, skill_version: 3, error: null },
    });
    renderTab();
    const run = await screen.findByRole("button", { name: /Run eval case “src\/a.ts:12/ });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    await waitFor(() => expect(calls.some((c) => c.path === "/eval-cases/c1/run")).toBe(true));
    expect(calls.find((c) => c.path === "/eval-cases/c1/run")!.body).toEqual({ agent_id: "h1" });
  });

  it("compares two skill runs under the skill title; opens with exactly the NFR-3 reads and no POST", async () => {
    const calls = mockFetch({
      "GET /agents": AGENTS,
      "GET /skills/s1/eval-cases": CASES,
      "GET /skills/s1/eval-runs": [
        suite("r2", "h1", "2026-10-12T10:00:00Z", { skill_version: 3 }),
        suite("r1", "h1", "2026-10-11T10:00:00Z", { skill_version: 2 }),
      ],
      "GET /skills/s1/stats": stats(["h1"]),
      "GET /eval-runs/r1": { ...suite("r1", "h1", "2026-10-11T10:00:00Z", { skill_version: 2 }), cases: [] },
      "GET /eval-runs/r2": { ...suite("r2", "h1", "2026-10-12T10:00:00Z", { skill_version: 3 }), cases: [] },
      "GET /skills/s1/versions": [
        { version: 3, body: "a", created_at: "x" },
        { version: 2, body: "b", created_at: "x" },
      ],
    });
    renderTab();
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
    // NFR-3 (G2) + NFR-2 (G3): each read once, plus the reference suite's detail; no POST
    await waitFor(() => expect(calls.some((c) => c.path === "/eval-runs/r2")).toBe(true));
    const gets = calls.map((c) => `${c.method} ${c.path}`).sort();
    expect(gets).toEqual([
      "GET /agents",
      "GET /eval-runs/r2",
      "GET /skills/s1/eval-cases",
      "GET /skills/s1/eval-runs",
      "GET /skills/s1/stats",
    ]);

    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByRole("dialog", { name: "Compare runs · v2 → v3" })).toBeInTheDocument();
    expect(calls.some((c) => c.method !== "GET")).toBe(false);
  });
});

describe("SkillEvalsTab case-list heading row (Spec G3 AC-2, AC-10)", () => {
  it("reaches the run control as 'Run all evals' inside the Eval cases section, next to New eval case and Copy", async () => {
    mockFetch({
      "GET /agents": AGENTS,
      "GET /skills/s1/eval-cases": CASES,
      "GET /skills/s1/eval-runs": [],
      "GET /skills/s1/stats": stats(["h1"]),
    });
    renderTab();
    const section = await screen.findByRole("region", { name: "Eval cases" });
    const names = within(section)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent)
      .slice(0, 3);
    expect(names).toEqual(["Run all evals", "New eval case", "Copy from agent case"]);
    expect(screen.queryByText(/Run eval \(/)).toBeNull();
  });
});
