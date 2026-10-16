import type { EvalRecentRun } from "@devdigest/shared";
import { metricPoints } from "@/components/agent-evals/helpers";

/**
 * Recall series per agent for the card sparklines (Spec F AC-26): the agent's
 * items of the recent-runs response, oldest first, null recall dropped. The
 * server sends the response newest first.
 */
export function recallPointsByAgent(items: readonly EvalRecentRun[]): Map<string, number[]> {
  const groups = new Map<string, EvalRecentRun[]>();
  for (const item of items) {
    const group = groups.get(item.agent_id);
    if (group) group.push(item);
    else groups.set(item.agent_id, [item]);
  }
  const out = new Map<string, number[]>();
  for (const [agentId, group] of groups) out.set(agentId, metricPoints(group, "recall"));
  return out;
}
