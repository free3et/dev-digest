import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  card: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
    padding: "14px 16px",
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 10,
  } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700, lineHeight: 1.1 } satisfies CSSProperties,
  delta: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  spark: { display: "inline-flex", flexShrink: 0 } satisfies CSSProperties,
} as const;
