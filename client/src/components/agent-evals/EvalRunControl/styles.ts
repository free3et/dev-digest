import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  headingRow: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  progress: { fontSize: 13, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  notice: { fontSize: 12, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
} as const;
