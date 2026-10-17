import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  label: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", flexShrink: 0 } satisfies CSSProperties,
  // Long agent and model names stay on one line; the title carries the full text.
  select: {
    minWidth: 0,
    maxWidth: 360,
    flexShrink: 1,
    padding: "6px 8px",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--border)",
    borderRadius: 6,
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
