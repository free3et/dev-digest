import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" } satisfies CSSProperties,
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--accent)",
    textDecoration: "underline",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", lineHeight: 1.4 } satisfies CSSProperties,
} as const;
