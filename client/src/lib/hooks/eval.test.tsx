import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalSuiteRun, EvalSuiteRunDetail } from "@devdigest/shared";
import { mockFetch } from "@/test/render";
import {
  useAgentEvalCases,
  useAgentEvalRuns,
  useCreateEvalCase,
  useDeleteEvalCase,
  useEvalCaseDraft,
  useEvalDashboard,
  useEvalDryRun,
  useEvalRecentRuns,
  useEvalRun,
  useStartEvalRun,
} from "./eval";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const CASE = { id: "c1", name: "a.ts:1 x" } as unknown as EvalCase;

function suite(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "r1",
    agent_id: "a1",
    agent_version: 1,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "running",
    ran_at: "2026-10-12T10:00:00Z",
    finished_at: null,
    case_ids: ["c1", "c2"],
    skills: [],
    cases_total: 2,
    cases_completed: 0,
    cases_passed: 0,
    cases_errored: 0,
    recall: null,
    precision: null,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    error: null,
    ...over,
  };
}

describe("eval hooks", () => {
  it("lists cases under ['eval-cases', agentId] and stays idle without an agent", async () => {
    const calls = mockFetch({ "GET /agents/a1/eval-cases": [CASE] });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useAgentEvalCases("a1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([CASE]));
    expect(qc.getQueryData(["eval-cases", "a1"])).toEqual([CASE]);

    calls.length = 0;
    renderHook(() => useAgentEvalCases(null), { wrapper });
    expect(calls).toHaveLength(0);
  });

  it("creates a case from a finding and invalidates the agent's cases", async () => {
    const calls = mockFetch({ "POST /findings/f1/eval-case": CASE });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCase("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ findingId: "f1" });
    });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/findings/f1/eval-case", body: undefined });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-cases", "a1"] });
  });

  it("sends the name and expected_output overrides as the create body", async () => {
    const calls = mockFetch({ "POST /findings/f1/eval-case": CASE });
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateEvalCase("a1"), { wrapper });
    const expected_output = {
      kind: "must_find" as const,
      file: "src/a.ts",
      start_line: 2,
      end_line: 3,
      title: "t",
      severity: "WARNING",
      category: "security",
    };
    await act(async () => {
      await result.current.mutateAsync({ findingId: "f1", overrides: { name: "mine", expected_output } });
    });
    expect(calls[0]?.body).toEqual({ name: "mine", expected_output });
  });

  it("reads the draft from GET /findings/:id/eval-case/draft and stays idle without an id", async () => {
    const draft = { finding_id: "f1", agent_id: "a1", name: "n" };
    const calls = mockFetch({ "GET /findings/f1/eval-case/draft": draft });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useEvalCaseDraft("f1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(draft));
    expect(calls[0]).toMatchObject({ method: "GET", path: "/findings/f1/eval-case/draft" });
    expect(qc.getQueryData(["eval-case-draft", "f1"])).toEqual(draft);

    calls.length = 0;
    renderHook(() => useEvalCaseDraft(null), { wrapper });
    expect(calls).toHaveLength(0);
  });

  it("posts the expectation to the dry-run endpoint and invalidates nothing", async () => {
    const dry = { outcome: "passed", pass: true };
    const calls = mockFetch({ "POST /findings/f1/eval-case/dry-run": dry });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useEvalDryRun("f1"), { wrapper });
    const expected_output = {
      kind: "must_not_flag" as const,
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      title: "t",
      severity: "WARNING",
      category: "security",
    };
    await act(async () => {
      await result.current.mutateAsync(expected_output);
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/findings/f1/eval-case/dry-run",
      body: { expected_output },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("deletes a case and invalidates the agent's cases", async () => {
    const calls = mockFetch({ "DELETE /eval-cases/c1": { ok: true } });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteEvalCase("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("c1");
    });
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/eval-cases/c1" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-cases", "a1"] });
  });

  it("starts a run and invalidates history and dashboard", async () => {
    const calls = mockFetch({ "POST /agents/a1/eval-runs": suite() });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useStartEvalRun("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/agents/a1/eval-runs" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-runs", "a1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-dashboard"] });
  });

  it("polls a running suite every 2 s, then stops and invalidates history once it finishes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let n = 0;
    const calls = mockFetch({
      "GET /eval-runs/r1": () => {
        n += 1;
        const detail: EvalSuiteRunDetail =
          n < 2
            ? { ...suite(), cases: [] }
            : { ...suite({ status: "done", cases_completed: 2, finished_at: "2026-10-12T10:01:00Z" }), cases: [] };
        return detail;
      },
    });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useEvalRun("r1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("running"));
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ["eval-runs", "a1"] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(result.current.data?.status).toBe("done"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-runs", "a1"] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-dashboard"] });

    const done = calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(calls).toHaveLength(done);
  });

  it("does not poll an already finished suite", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = mockFetch({ "GET /eval-runs/r1": { ...suite({ status: "done" }), cases: [] } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useEvalRun("r1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("done"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls).toHaveLength(1);
  });

  it("reads history and dashboard", async () => {
    mockFetch({
      "GET /agents/a1/eval-runs": [suite({ status: "done" })],
      "GET /eval/dashboard": [],
    });
    const { wrapper } = setup();
    const history = renderHook(() => useAgentEvalRuns("a1"), { wrapper });
    const dash = renderHook(() => useEvalDashboard(), { wrapper });
    await waitFor(() => expect(history.result.current.data).toHaveLength(1));
    await waitFor(() => expect(dash.result.current.data).toEqual([]));
  });

  it("reads recent runs with the limit, refetches on a dashboard invalidation and does not poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = mockFetch({
      "GET /eval/recent-runs?limit=10": [{ ...suite({ status: "done" }), agent_name: "Reviewer" }],
    });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useEvalRecentRuns(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /eval/recent-runs?limit=10"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls).toHaveLength(1);

    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    });
    await waitFor(() => expect(calls).toHaveLength(2));
  });
});
