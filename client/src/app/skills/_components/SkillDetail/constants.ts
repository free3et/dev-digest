export const SKILL_TABS = ["config", "preview", "stats", "versions"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];
export const DEFAULT_SKILL_TAB: SkillTab = "config";

export const SKILL_TAB_ICONS = {
  config: "Settings",
  preview: "Eye",
  stats: "BarChart",
  versions: "History",
} as const;
