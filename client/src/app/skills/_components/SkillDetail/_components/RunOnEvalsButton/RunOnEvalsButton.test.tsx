import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { EvalSuiteRun } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { RunOnEvalsButton } from "./RunOnEvalsButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HOST = { id: "h1", name: "Reviewer A", model: "gpt-x" };
const CASES = [{ id: "c1" }, { id: "c2" }];

function suite(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "r1",
    owner_kind: "skill",
    agent_id: "h1",
    agent_version: 2,
    skill_id: "s1",
    skill_version: 3,
    status: "done",
    ran_at: "2026-10-12T09:00:00.000Z",
    finished_at: "2026-10-12T09:01:00.000Z",
    case_ids: ["c1", "c2"],
    skills: [],
    cases_total: 2,
    cases_completed: 2,
    cases_passed: 2,
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

const ROUTES = { "GET /skills/s1/eval-cases": CASES, "GET /skills/s1/eval-runs": [suite()] };

describe("RunOnEvalsButton", () => {
  it("confirms the spend, starts one run with the host and then reports the start", async () => {
    const onStarted = vi.fn();
    const calls = mockFetch({
      ...ROUTES,
      "POST /skills/s1/eval-runs": suite({ id: "r2", status: "running", cases_completed: 0 }),
    });
    renderWithProviders(<RunOnEvalsButton skillId="s1" host={HOST} onStarted={onStarted} />);
    const button = await screen.findByRole("button", { name: "Run on evals" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(screen.getByText(/Runs on Reviewer A · gpt-x\..*cost: \$0\.01\./)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.method === "POST")).toMatchObject([{ path: "/skills/s1/eval-runs", body: { agent_id: "h1" } }]);
  });

  it("is disabled with a text reason while a suite is running", async () => {
    mockFetch({ ...ROUTES, "GET /skills/s1/eval-runs": [suite({ id: "r9", status: "running", cases_completed: 0 })] });
    renderWithProviders(<RunOnEvalsButton skillId="s1" host={HOST} onStarted={() => {}} />);
    const button = await screen.findByRole("button", { name: "Run on evals" });
    await waitFor(() => expect(button).toHaveAccessibleDescription("An eval run is in progress"));
    expect(button).toBeDisabled();
  });

  it("is disabled with no cases, and with no host", async () => {
    mockFetch({ ...ROUTES, "GET /skills/s1/eval-cases": [] });
    const { unmount } = renderWithProviders(<RunOnEvalsButton skillId="s1" host={HOST} onStarted={() => {}} />);
    const none = await screen.findByRole("button", { name: "Run on evals" });
    await waitFor(() => expect(none).toHaveAccessibleDescription("Add an eval case first"));
    expect(none).toBeDisabled();
    unmount();

    mockFetch(ROUTES);
    renderWithProviders(<RunOnEvalsButton skillId="s1" host={null} onStarted={() => {}} />);
    const noHost = await screen.findByRole("button", { name: "Run on evals" });
    await waitFor(() => expect(noHost).toHaveAccessibleDescription("Pick an agent to run this skill's evals"));
    expect(noHost).toBeDisabled();
  });

  it("shows the refusal inline for 409 eval_run_in_progress and stays usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ error: { code: "eval_run_in_progress", message: "m" } }), { status: 409 });
        }
        return new Response(JSON.stringify(path.endsWith("eval-cases") ? CASES : [suite()]), { status: 200 });
      }),
    );
    const onStarted = vi.fn();
    renderWithProviders(<RunOnEvalsButton skillId="s1" host={HOST} onStarted={onStarted} />);
    const button = await screen.findByRole("button", { name: "Run on evals" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/run of this skill is already in progress/);
    expect(onStarted).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run on evals" })).toBeEnabled());
  });
});
