import type { CSSProperties } from "react";

/** Element styles for the rendered markdown. */
export const md = {
  h1: { fontSize: 22, fontWeight: 650, color: "var(--text-primary)", margin: "0 0 14px" } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 650, color: "var(--text-primary)", margin: "22px 0 8px" } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 650, color: "var(--text-primary)", margin: "18px 0 6px" } satisfies CSSProperties,
  p: { margin: "0 0 12px" } satisfies CSSProperties,
  ul: { margin: "0 0 12px", paddingLeft: 22 } satisfies CSSProperties,
  li: { margin: "2px 0" } satisfies CSSProperties,
  strong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  code: { fontSize: "0.92em", padding: "1px 6px", borderRadius: 4, background: "var(--bg-hover)", color: "var(--accent-text)" } satisfies CSSProperties,
  pre: { margin: "0 0 12px", padding: 12, borderRadius: 6, background: "var(--code-bg)", overflow: "auto", fontSize: 13 } satisfies CSSProperties,
  a: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  // Tables scroll sideways instead of squeezing columns. Cells reset `overflowWrap` because the
  // surrounding preview sets `anywhere`, which would split numbers like `~$0.015` mid-token.
  tableWrap: {
    margin: "0 0 14px",
    overflowX: "auto",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, lineHeight: 1.5 } satisfies CSSProperties,
  thead: { background: "var(--bg-hover)" } satisfies CSSProperties,
  th: {
    padding: "8px 12px",
    textAlign: "left",
    fontWeight: 650,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border-strong)",
    overflowWrap: "normal",
    wordBreak: "normal",
  } satisfies CSSProperties,
  td: {
    padding: "8px 12px",
    textAlign: "left",
    verticalAlign: "top",
    borderTop: "1px solid var(--border)",
    overflowWrap: "normal",
    wordBreak: "normal",
  } satisfies CSSProperties,
} as const;
