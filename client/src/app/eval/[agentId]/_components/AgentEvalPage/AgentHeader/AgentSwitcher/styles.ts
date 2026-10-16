import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", position: "relative", flexShrink: 0 } satisfies CSSProperties,
  select: {
    maxWidth: 220,
    height: 32,
    padding: "0 28px 0 10px",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
} as const;
