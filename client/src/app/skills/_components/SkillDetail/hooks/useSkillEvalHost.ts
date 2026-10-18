/* useSkillEvalHost — which agent hosts the skill's eval runs (Spec G2 AC-5).
   The preset is derived from server state (newest suite, linked agents); only
   the user's explicit choice is local state, stored with its skill id because
   `SkillDetail` is not keyed by skill. One instance serves the header button
   and the Evals tab. */
"use client";

import { useMemo, useState } from "react";
import { useAgents } from "@/lib/hooks/agents";
import type { EvalHost } from "@/lib/hooks/eval";
import { useSkillEvalRuns } from "@/lib/hooks/eval";
import { useSkillStats } from "@/lib/hooks/skill-stats";
import { presetHostId } from "../helpers";

export interface SkillEvalHostState {
  /** Every agent of the workspace, in the server's order; undefined while loading. */
  hostList: readonly EvalHost[] | undefined;
  hosts: ReadonlyMap<string, EvalHost> | undefined;
  hostId: string | null;
  host: EvalHost | null;
  setHostId: (id: string | null) => void;
}

export function useSkillEvalHost(skillId: string): SkillEvalHostState {
  const agents = useAgents();
  const runs = useSkillEvalRuns(skillId);
  const stats = useSkillStats(skillId);
  const [choice, setChoice] = useState<{ skillId: string; agentId: string | null } | null>(null);

  const hostList = useMemo(
    () => agents.data?.map((a): EvalHost => ({ id: a.id, name: a.name, model: a.model })),
    [agents.data],
  );
  const hosts = useMemo(() => (hostList ? new Map(hostList.map((h) => [h.id, h])) : undefined), [hostList]);

  const preset = presetHostId({
    suites: runs.data,
    statsAgents: stats.isError ? undefined : stats.data?.agents,
    agents: agents.data,
  });
  const explicit = choice && choice.skillId === skillId ? choice : null;
  // A chosen agent that has since been deleted falls back to the preset.
  const chosen = explicit ? (explicit.agentId === null || hosts?.has(explicit.agentId) ? explicit.agentId : preset) : preset;
  const hostId = chosen;
  const host = hostId ? (hosts?.get(hostId) ?? null) : null;

  return { hostList, hosts, hostId, host, setHostId: (id) => setChoice({ skillId, agentId: id }) };
}
