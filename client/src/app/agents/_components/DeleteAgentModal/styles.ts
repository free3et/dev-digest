import type { CSSProperties } from "react";

export const s = {
  body: { margin: 0, padding: "18px 24px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
