import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  headerText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  version: { color: "var(--accent-text)", fontWeight: 600 } satisfies CSSProperties,
  host: { maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  heading: { fontSize: 14, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 12, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: {
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
