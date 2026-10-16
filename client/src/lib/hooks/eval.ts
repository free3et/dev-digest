/* hooks/eval.ts — React Query hooks for eval cases, suite runs, history and
   the Eval Dashboard (Spec A + B). Components never call fetch. */
"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalCase,
  EvalCaseDraft,
  EvalCaseOverrides,
  EvalDashboardRow,
  EvalDryRunResult,
  EvalExpectationInput,
  EvalRecentRun,
  EvalSuiteRun,
  EvalSuiteRunDetail,
} from "@devdigest/shared";

/** Poll interval (ms) while a suite run is still `running` (Spec B AC-2). */
export const EVAL_RUN_POLL_MS = 2000;

/** Cases of an agent, ordered by name (server side). Idle without an agent id. */
export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/**
 * The would-be case of a decided finding (Spec C): `GET /findings/:id/eval-case/draft`.
 * Reads only. Never cached: the modal must always show the server's current
 * derivation, so reopening it refetches (AC-21). Idle without a finding id.
 */
export function useEvalCaseDraft(findingId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case-draft", findingId],
    queryFn: () => api.get<EvalCaseDraft>(`/findings/${findingId}/eval-case/draft`),
    enabled: !!findingId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/**
 * One stateless dry-run of the would-be case (Spec C): one paid model call,
 * nothing stored, so nothing is invalidated. Pass the edited expectation, or
 * nothing to score against the derived one.
 */
export function useEvalDryRun(findingId: string | null | undefined) {
  return useMutation({
    mutationFn: (expectedOutput?: EvalExpectationInput) =>
      api.post<EvalDryRunResult>(
        `/findings/${findingId}/eval-case/dry-run`,
        expectedOutput ? { expected_output: expectedOutput } : undefined,
      ),
  });
}

/**
 * Save a decided finding as an eval case. `overrides` is the optional
 * `{ name, expected_output }` body (Spec C); omit it for the Spec A behaviour.
 * `agentId` scopes the invalidation.
 */
export function useCreateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, overrides }: { findingId: string; overrides?: EvalCaseOverrides }) =>
      api.post<EvalCase>(`/findings/${findingId}/eval-case`, overrides),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}

export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/eval-cases/${caseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}

/** Start a suite run (202, status `running`). */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalSuiteRun>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/**
 * One suite run with its per-case records. Refetches every 2 s while the
 * status is `running`; when a poll observes it leaving `running`, the history
 * and the dashboard are invalidated once. Idle without an id.
 */
export function useEvalRun(id: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-run", id],
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_RUN_POLL_MS : false),
  });

  const status = query.data?.status;
  const agentId = query.data?.agent_id;
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prev.current === "running" && status && status !== "running") {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    }
    prev.current = status;
  }, [status, agentId, qc]);

  return query;
}

/** Suite-run history of an agent, newest first, at most 50 (server side). */
export function useAgentEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-runs", agentId],
    queryFn: () => api.get<EvalSuiteRun[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}

/** One row per agent that has at least one case. No polling (Spec B EC-6). */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboardRow[]>("/eval/dashboard"),
  });
}

/**
 * Newest finished suite runs across every agent of the workspace (Spec D):
 * `GET /eval/recent-runs?limit=`. Key lives under `["eval-dashboard"]`, so the
 * existing invalidations of the dashboard refetch it too. No polling.
 */
export function useEvalRecentRuns(limit = 10) {
  return useQuery({
    queryKey: ["eval-dashboard", "recent-runs", limit],
    queryFn: () => api.get<EvalRecentRun[]>(`/eval/recent-runs?limit=${limit}`),
  });
}
