import type { CSSProperties } from "react";

export type PillTone = "crit" | "accent" | "warn" | "ok";

/** Text stays `--text-primary` (small coloured text fails 4.5:1); the tone is a border + tint.
 *  Longhands only: never a shorthand base with a longhand override. */
export function pillStyle(tone: PillTone): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    whiteSpace: "nowrap",
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.4,
    padding: "1px 8px",
    borderRadius: 99,
    color: "var(--text-primary)",
    background: `var(--${tone}-bg)`,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: `var(--${tone})`,
  };
}
