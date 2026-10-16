import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  heading: { fontSize: 14, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--border)",
  } satisfies CSSProperties,
  rowMain: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 } satisfies CSSProperties,
  badgeWrap: { display: "inline-flex", flexShrink: 0 } satisfies CSSProperties,
  // Long names and paths must not wrap one word per line (client INSIGHTS 2026-09-26).
  name: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  location: {
    minWidth: 0,
    fontSize: 12,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
  modalBody: {
    margin: 0,
    padding: "18px 24px",
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;

/** Tone as a 1 px border (longhands) + tint; the text stays `--text-primary` (NFR-1). */
export function kindBadgeStyle(tone: "ok" | "warn"): CSSProperties {
  return { borderWidth: 1, borderStyle: "solid", borderColor: `var(--${tone})` };
}
