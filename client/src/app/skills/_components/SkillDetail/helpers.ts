import { DEFAULT_SKILL_TAB, SKILL_TABS, type SkillTab } from "./constants";

/** Any unknown / missing `?tab=` value falls back to the Config tab. */
export function parseSkillTab(raw: string | null | undefined): SkillTab {
  return SKILL_TABS.find((t) => t === raw) ?? DEFAULT_SKILL_TAB;
}

interface PresetInput {
  /** The skill's suites, newest first. */
  suites: readonly { agent_id: string }[] | undefined;
  /** `SkillStats.agents`; undefined when the stats failed or are loading. */
  statsAgents: readonly { id: string }[] | undefined;
  /** Every agent of the workspace; undefined while loading. */
  agents: readonly { id: string }[] | undefined;
}

/**
 * The host agent preselected on the Evals tab (Spec G2 AC-5): the newest
 * suite's agent if it still exists, else the first linked agent that exists,
 * else none. Nothing is chosen while the agent list is unknown.
 */
export function presetHostId({ suites, statsAgents, agents }: PresetInput): string | null {
  if (!agents) return null;
  const exists = new Set(agents.map((a) => a.id));
  const newest = suites?.[0]?.agent_id;
  if (newest && exists.has(newest)) return newest;
  return statsAgents?.find((a) => exists.has(a.id))?.id ?? null;
}
