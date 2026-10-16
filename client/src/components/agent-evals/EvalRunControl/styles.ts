import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  progress: { fontSize: 13, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  notice: { fontSize: 12, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
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
