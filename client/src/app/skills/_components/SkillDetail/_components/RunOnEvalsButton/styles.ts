import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", margin: 0, maxWidth: 320 } satisfies CSSProperties,
} as const;
