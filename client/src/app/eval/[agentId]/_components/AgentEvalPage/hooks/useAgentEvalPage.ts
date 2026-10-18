/* State of the per-agent eval page (Spec F F7). The route segment reaches a
   hook only after the UUID gate: a non-UUID segment sends no request at all
   (every hook is idle on `null`). The hooks are the existing ones, so the page
   adds no endpoint, key or polling (NFR-2). */
"use client";

import { useAgent } from "@/lib/hooks/agents";
import { useAgentEvalCases, useAgentEvalRuns } from "@/lib/hooks/eval";
import { isUuid, pageState } from "../helpers";

export function useAgentEvalPage(rawAgentId: string) {
  const validId = isUuid(rawAgentId) ? rawAgentId : null;
  const agent = useAgent(validId);
  const runs = useAgentEvalRuns(validId);
  const cases = useAgentEvalCases(validId);
  const state = pageState({ validId, agent, runs });
  return {
    validId,
    state,
    agent,
    runs,
    cases,
    retryAgent: () => void agent.refetch(),
  };
}
