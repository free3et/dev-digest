import type { BriefMissingInput, RiskSeverity } from "@devdigest/shared";

/** `brief.card.missing.*` key per missing input (the enum is snake_case, i18n keys camelCase). */
export const MISSING_KEY: Record<BriefMissingInput, string> = {
  intent: "intent",
  blast: "blast",
  smart_diff: "smartDiff",
  linked_issue: "linkedIssue",
  context_docs: "contextDocs",
};

export const SEVERITY_TONE: Record<RiskSeverity, { color: string; bg: string }> = {
  high: { color: "var(--crit)", bg: "var(--crit-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
