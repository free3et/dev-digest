import type { CSSProperties } from "react";

// Longhands only: a shorthand base with a longhand override leaves stale
// colours behind (client INSIGHTS 2026-10-07).
export const s = {
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    margin: 0,
    padding: "10px 14px",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  icon: { flexShrink: 0, marginTop: 2, color: "var(--warn)" } satisfies CSSProperties,
} as const;
