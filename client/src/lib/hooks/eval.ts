/* hooks/eval.ts — React Query hooks for eval cases, suite runs, history and
   the Eval Dashboard (Spec A + B). Components never call fetch. */
"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  EvalCase,
  EvalCaseDraft,
  EvalCaseManualCreate,
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

/** Who owns a set of eval cases and suites: an agent or a skill (Spec G2). */
export interface EvalOwner {
  kind: "agent" | "skill";
  id: string;
}

/** The agent whose prompt and model run a skill's cases (Spec G2). */
export interface EvalHost {
  id: string;
  name: string;
  model: string;
}

/** Query key of an owner's case list. */
function casesKey(owner: EvalOwner | string | null | undefined) {
  if (owner == null) return ["eval-cases", null] as const;
  if (typeof owner === "string") return ["eval-cases", owner] as const;
  return owner.kind === "skill" ? (["skill-eval-cases", owner.id] as const) : (["eval-cases", owner.id] as const);
}

/** A refused skill request names a host that is gone: refetch the agent list (G2 EC-3). */
function refreshAgentsOnHostGone(qc: ReturnType<typeof useQueryClient>, err: unknown) {
  if (err instanceof ApiError && err.code === "host_not_found") {
    qc.invalidateQueries({ queryKey: ["agents"] });
  }
}

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

/** `owner` as a string means an agent id; an `EvalOwner` may be a skill. */
export function useDeleteEvalCase(owner: EvalOwner | string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/eval-cases/${caseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: casesKey(owner) });
    },
  });
}

/** Create a case by hand (`POST /agents/:id/eval-cases`); refetches the list. */
export function useCreateManualEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EvalCaseManualCreate) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}

/** Edit a case's name / expectation (`PATCH /eval-cases/:id`); refetches the list. */
export function useUpdateEvalCase(owner: EvalOwner | string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, body }: { caseId: string; body: EvalCaseOverrides }) =>
      api.patch<EvalCase>(`/eval-cases/${caseId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: casesKey(owner) });
    },
  });
}

/**
 * Run ONE stored case (`POST /eval-cases/:id/run`): stateless like the dry-run,
 * nothing stored, so nothing is invalidated. `expectedOutput` overrides the
 * expectation for scoring only. One paid model call per click.
 */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    // `agentId` (the host) is sent only for a skill-owned case (Spec G2 AC-7).
    mutationFn: ({
      caseId,
      expectedOutput,
      agentId,
    }: {
      caseId: string;
      expectedOutput?: EvalExpectationInput;
      agentId?: string;
    }) =>
      api.post<EvalDryRunResult>(`/eval-cases/${caseId}/run`, {
        ...(expectedOutput ? { expected_output: expectedOutput } : {}),
        ...(agentId ? { agent_id: agentId } : {}),
      }),
    onError: (err) => refreshAgentsOnHostGone(qc, err),
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
  const skillId = query.data?.owner_kind === "skill" ? query.data.skill_id : null;
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prev.current === "running" && status && status !== "running") {
      if (skillId) {
        // A skill suite never touches the agent's history or the dashboard (G1 C-5).
        qc.invalidateQueries({ queryKey: ["skill-eval-runs", skillId] });
      } else {
        qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
        qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      }
    }
    prev.current = status;
  }, [status, agentId, skillId, qc]);

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

// ---------------------------------------------------------------------------
// Skill-owned evals (Spec G2). Keys are separate from the agent ones, so the
// agent Evals tab, the dashboard and the per-agent page are never touched.
// ---------------------------------------------------------------------------

/** Cases of a skill. Idle without a skill id. */
export function useSkillEvalCases(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-eval-cases", skillId],
    queryFn: () => api.get<EvalCase[]>(`/skills/${skillId}/eval-cases`),
    enabled: !!skillId,
  });
}

/** Suite-run history of a skill, newest first. Idle without a skill id. */
export function useSkillEvalRuns(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-eval-runs", skillId],
    queryFn: () => api.get<EvalSuiteRun[]>(`/skills/${skillId}/eval-runs`),
    enabled: !!skillId,
  });
}

/**
 * Start a skill suite through a host agent: `mutate(agentId)` posts
 * `{ agent_id }`. The created suite is put at the head of the history cache so
 * the tab adopts it at once. The dashboard is not touched.
 */
export function useStartSkillEvalRun(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalSuiteRun>(`/skills/${skillId}/eval-runs`, { agent_id: agentId }),
    onSuccess: (created) => {
      qc.setQueryData<EvalSuiteRun[]>(["skill-eval-runs", skillId], (old) => [
        created,
        ...(old ?? []).filter((r) => r.id !== created.id),
      ]);
      qc.invalidateQueries({ queryKey: ["skill-eval-runs", skillId] });
    },
    onError: (err) => refreshAgentsOnHostGone(qc, err),
  });
}

/** Create a hand-written case of a skill (`POST /skills/:id/eval-cases`). */
export function useCreateSkillManualEvalCase(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EvalCaseManualCreate) => api.post<EvalCase>(`/skills/${skillId}/eval-cases`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-eval-cases", skillId] });
    },
  });
}

/** Copy one agent case into a skill's set (`POST /skills/:id/eval-cases/copy`). */
export function useCopyEvalCaseToSkill(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalCase>(`/skills/${skillId}/eval-cases/copy`, { case_id: caseId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-eval-cases", skillId] });
    },
  });
}

/** Cases of several agents, sharing the agents' own cache keys. Idle unless `enabled`. */
export function useAgentCasesForCopy(agentIds: readonly string[], enabled: boolean) {
  return useQueries({
    queries: agentIds.map((id) => ({
      queryKey: ["eval-cases", id] as const,
      queryFn: () => api.get<EvalCase[]>(`/agents/${id}/eval-cases`),
      enabled,
    })),
  });
}

/** The owner's cases: the inactive kind's query gets `null` and sends nothing. */
export function useOwnerEvalCases(owner: EvalOwner) {
  const agent = useAgentEvalCases(owner.kind === "agent" ? owner.id : null);
  const skill = useSkillEvalCases(owner.kind === "skill" ? owner.id : null);
  return owner.kind === "skill" ? skill : agent;
}

/** The owner's suite history, same dispatch as `useOwnerEvalCases`. */
export function useOwnerEvalRuns(owner: EvalOwner) {
  const agent = useAgentEvalRuns(owner.kind === "agent" ? owner.id : null);
  const skill = useSkillEvalRuns(owner.kind === "skill" ? owner.id : null);
  return owner.kind === "skill" ? skill : agent;
}
