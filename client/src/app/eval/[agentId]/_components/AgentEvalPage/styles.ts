import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", flexDirection: "column", gap: 20, padding: "24px 28px" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  notFound: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", padding: "24px 28px" } satisfies CSSProperties,
  notFoundTitle: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  noCases: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    alignItems: "flex-start",
    padding: "14px 16px",
    fontSize: 13,
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 10,
  } satisfies CSSProperties,
} as const;
