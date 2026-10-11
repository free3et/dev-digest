import type { CSSProperties } from "react";
import type { ContextDocType } from "@devdigest/shared";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 6, display: "grid", gap: 2 } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    columnGap: 12,
    rowGap: 3,
    alignItems: "center",
    width: "100%",
    padding: "9px 12px",
    textAlign: "left",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    color: "var(--text-primary)",
    cursor: "pointer",
    font: "inherit",
  } satisfies CSSProperties,
  // Override with the `border` shorthand, not `borderColor`: React clears a longhand it no longer
  // sets, which resets the colour to `currentColor` (white) and leaves a stale outline on every
  // row that was once selected.
  rowActive: {
    background: "var(--accent-bg)",
    border: "1px solid var(--accent)",
  } satisfies CSSProperties,
  icon: { gridRow: "1 / span 2", color: "var(--text-muted)" } satisfies CSSProperties,
  iconActive: { color: "var(--accent-text)" } satisfies CSSProperties,
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 500 } satisfies CSSProperties,
  folder: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  badge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "2px 8px",
    borderRadius: 5,
    justifySelf: "end",
  } satisfies CSSProperties,
  tokens: { fontSize: 11, color: "var(--text-muted)", textAlign: "right" } satisfies CSSProperties,
} as const;

/** Badge colours per document type; unknown types fall back to the neutral info tone. */
export const BADGE_TONE: Record<ContextDocType, CSSProperties> = {
  docs: { color: "var(--ok)", background: "var(--ok-bg)" },
  specs: { color: "var(--accent-text)", background: "var(--accent-bg)" },
  insights: { color: "var(--warn)", background: "var(--warn-bg)" },
};
