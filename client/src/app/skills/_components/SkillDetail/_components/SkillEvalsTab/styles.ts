import type { CSSProperties } from "react";

/** Co-located styles for the skill Evals tab shell. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
  subtitle: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
