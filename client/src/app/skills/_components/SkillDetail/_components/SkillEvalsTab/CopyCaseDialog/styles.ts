import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 12, padding: "16px 24px", minWidth: 0 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 14, maxHeight: 360, overflow: "auto" } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  agentName: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  caseName: {
    display: "block",
    maxWidth: 440,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "left",
  } satisfies CSSProperties,
} as const;
