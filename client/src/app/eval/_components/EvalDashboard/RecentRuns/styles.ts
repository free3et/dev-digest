import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  // Caption style (size, weight, colour) is spread on top of this in the component.
  h2: { display: "flex", alignItems: "center", gap: 6, margin: 0 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  // Rows are cards: separate borders + row spacing, background on the cells.
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0 6px",
    fontSize: 13,
    tableLayout: "fixed",
  } satisfies CSSProperties,
  td: { padding: "10px", background: "var(--bg-elevated)", verticalAlign: "middle" } satisfies CSSProperties,
  first: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 } satisfies CSSProperties,
  last: { borderTopRightRadius: 10, borderBottomRightRadius: 10 } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 12.5 } satisfies CSSProperties,
  // Plain text, not a link; accent-text keeps 4.5:1 on the card background.
  version: { color: "var(--accent-text)", fontWeight: 600 } satisfies CSSProperties,
  // Long agent names must not wrap (client INSIGHTS 2026-09-26); full name in the title attribute.
  link: {
    display: "block",
    color: "var(--text-primary)",
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metric: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  track: {
    flex: "1 1 auto",
    minWidth: 24,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-hover)",
    overflow: "hidden",
  } satisfies CSSProperties,
  bar: { display: "block", height: "100%" } satisfies CSSProperties,
  pct: { flexShrink: 0, minWidth: 36, textAlign: "right" } satisfies CSSProperties,
  partial: { marginLeft: 8 } satisfies CSSProperties,
} as const;
