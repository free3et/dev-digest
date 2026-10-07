/* hooks/context-docs.ts — attached Project Context documents of agents and skills
   (GET/PUT /agents/:id/context-docs, /skills/:id/context-docs). */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentContextDocs, SkillContextDocs } from "../types";

const AGENT_KEY = "agent-context-docs";
const SKILL_KEY = "skill-context-docs";

/** Attached documents change `used_by_agents` on the Project Context list and file queries. */
function invalidateContext(qc: QueryClient, repoId: string | null | undefined) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["context", repoId] }),
    qc.invalidateQueries({ queryKey: ["context-file", repoId] }),
  ]);
}

export function useAgentContextDocs(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: [AGENT_KEY, agentId, repoId],
    queryFn: () => api.get<AgentContextDocs>(`/agents/${agentId}/context-docs?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!agentId && !!repoId,
  });
}

export function useSkillContextDocs(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: [SKILL_KEY, skillId, repoId],
    queryFn: () => api.get<SkillContextDocs>(`/skills/${skillId}/context-docs?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!skillId && !!repoId,
  });
}

/** Replaces the agent's own attached list; `paths` is the full ordered list. */
export function useSetAgentContextDocs(agentId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<AgentContextDocs>(`/agents/${agentId}/context-docs`, { repo_id: repoId, paths }),
    onSuccess: (data) => {
      qc.setQueryData([AGENT_KEY, agentId, repoId], data);
      return invalidateContext(qc, repoId);
    },
  });
}

/** Replaces the skill's attached list; agents inheriting from it are refetched too. */
export function useSetSkillContextDocs(skillId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<SkillContextDocs>(`/skills/${skillId}/context-docs`, { repo_id: repoId, paths }),
    onSuccess: (data) => {
      qc.setQueryData([SKILL_KEY, skillId, repoId], data);
      return Promise.all([invalidateContext(qc, repoId), qc.invalidateQueries({ queryKey: [AGENT_KEY] })]);
    },
  });
}
