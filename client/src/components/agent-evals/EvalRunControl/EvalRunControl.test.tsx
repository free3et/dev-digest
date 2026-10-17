import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { EvalSuiteRun } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { EvalRunControl } from "./EvalRunControl";
import { casesDone, refusalKey } from "./helpers";
import { ApiError } from "@/lib/api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function suite(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "s1",
    agent_id: "ag1",
    agent_version: 1,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: "2026-10-12T09:00:00.000Z",
    finished_at: "2026-10-12T09:01:00.000Z",
    case_ids: ["c1", "c2", "c3"],
    skills: [],
    cases_total: 3,
    cases_completed: 3,
    cases_passed: 2,
    cases_errored: 0,
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: 0.014,
    duration_ms: 1000,
    error: null,
    ...over,
  };
}

const CASES = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];

/** fetch stub answering by "METHOD path"; entries may carry a status. */
function stub(routes: Record<string, { status?: number; body: unknown } | (() => { status?: number; body: unknown })>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const key = `${(init?.method ?? "GET").toUpperCase()} ${path}`;
      calls.push(key);
      const r = routes[key];
      const v = typeof r === "function" ? r() : r;
      if (!v) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(v.body), { status: v.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

describe("EvalRunControl", () => {
  it("confirms with n and last cost before POSTing; cancel sends nothing", async () => {
    const calls = stub({
      "GET /agents/ag1/eval-cases": { body: CASES },
      "GET /agents/ag1/eval-runs": { body: [suite({ id: "old", status: "failed", cost_usd: 9 }), suite()] },
      "POST /agents/ag1/eval-runs": { status: 202, body: suite({ id: "s2", status: "running", cases_completed: 0, cases_passed: 0 }) },
      "GET /eval-runs/s2": { body: { ...suite({ id: "s2", status: "running", cases_completed: 0 }), cases: [] } },
    });
    renderWithProviders(<EvalRunControl agentId="ag1" />);
    const run = await screen.findByRole("button", { name: "Run eval (3)" });
    await vi.waitFor(() => expect(calls).toContain("GET /agents/ag1/eval-runs"));
    await vi.waitFor(() => expect(run).toBeEnabled());

    fireEvent.click(run);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Run 3 eval cases?")).toBeInTheDocument();
    // newest FINISHED run's cost, not the failed run's
    expect(screen.getByText(/Last finished run cost: \$0\.014\./)).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith("POST"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.startsWith("POST"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Run eval (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(await screen.findByText("0 / 3 cases")).toBeInTheDocument();
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /agents/ag1/eval-runs"]);
    expect(screen.queryByRole("button", { name: /Run eval/ })).toBeNull();
  });

  it("shows the empty-cost marker when there is no finished run", async () => {
    stub({
      "GET /agents/ag1/eval-cases": { body: CASES },
      "GET /agents/ag1/eval-runs": { body: [] },
    });
    renderWithProviders(<EvalRunControl agentId="ag1" />);
    const run = await screen.findByRole("button", { name: "Run eval (3)" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(screen.getByText(/Last finished run cost: —\./)).toBeInTheDocument();
  });

  it("adopts a running suite from history and updates k / n from the poll (errored counted)", async () => {
    let polls = 0;
    stub({
      "GET /agents/ag1/eval-cases": { body: CASES },
      "GET /agents/ag1/eval-runs": { body: [suite({ id: "r1", status: "running", cases_completed: 0, cases_passed: 0, cases_errored: 0 })] },
      "GET /eval-runs/r1": () => {
        polls += 1;
        const done = polls > 1;
        return {
          body: {
            ...suite({ id: "r1", status: done ? "partial" : "running", cases_completed: done ? 2 : 1, cases_errored: done ? 1 : 1 }),
            cases: [],
          },
        };
      },
    });
    renderWithProviders(<EvalRunControl agentId="ag1" />);
    expect(await screen.findByText("2 / 3 cases")).toBeInTheDocument();
    // 1 completed + 1 errored of 3
    expect(screen.getByText("2 / 3 cases")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run eval/ })).toBeNull();

    expect(
      await screen.findByText("Run finished partially: 1 case errored.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval (3)" })).toBeInTheDocument();
  });

  it("renders a failed run's reason as plain text", async () => {
    stub({
      "GET /agents/ag1/eval-cases": { body: CASES },
      "GET /agents/ag1/eval-runs": { body: [suite({ id: "r1", status: "running", cases_completed: 0 })] },
      "GET /eval-runs/r1": {
        body: { ...suite({ id: "r1", status: "failed", error: "<script>x</script> no key", cases_completed: 0 }), cases: [] },
      },
    });
    renderWithProviders(<EvalRunControl agentId="ag1" />);
    expect(await screen.findByText("Run failed: <script>x</script> no key")).toBeInTheDocument();
  });

  it.each([
    [409, "eval_run_in_progress", /already in progress/],
    [422, "no_cases", /no eval cases/],
    [429, "rate_limited", /Too many requests/],
  ])("shows the refusal text for %i %s", async (status, code, text) => {
    stub({
      "GET /agents/ag1/eval-cases": { body: CASES },
      "GET /agents/ag1/eval-runs": { body: [] },
      "POST /agents/ag1/eval-runs": { status, body: { error: { code, message: "m" } } },
    });
    renderWithProviders(<EvalRunControl agentId="ag1" />);
    const run = await screen.findByRole("button", { name: "Run eval (3)" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("works through mockFetch for the idle state (200 only)", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": [], "GET /agents/ag1/eval-runs": [] });
    renderWithProviders(<EvalRunControl agentId="ag1" />);
    expect(await screen.findByRole("button", { name: "Run eval (0)" })).toBeDisabled();
  });
});

describe("helpers", () => {
  it("maps refusals by status and code", () => {
    expect(refusalKey(new ApiError("m", 429, "anything"))).toBe("rate_limited");
    expect(refusalKey(new ApiError("m", 409, "eval_run_in_progress"))).toBe("eval_run_in_progress");
    expect(refusalKey(new ApiError("m", 422, "too_many_cases"))).toBe("too_many_cases");
    expect(refusalKey(new ApiError("m", 500, "boom"))).toBe("unknown");
    expect(refusalKey(new Error("x"))).toBe("network_error");
  });

  it("counts errored cases as done", () => {
    expect(casesDone({ cases_completed: 2, cases_errored: 1 })).toBe(3);
  });
});
