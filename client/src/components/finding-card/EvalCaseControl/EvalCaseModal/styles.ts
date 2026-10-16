import type { CSSProperties } from "react";

const ellipsis = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 } satisfies CSSProperties;

const control = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--text-primary)",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
} satisfies CSSProperties;

export const s = {
  title: { display: "block", maxWidth: 560, ...ellipsis } satisfies CSSProperties,
  subtitle: { display: "block", maxWidth: 560, ...ellipsis } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
    padding: "18px 24px",
  } satisfies CSSProperties,
  column: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } satisfies CSSProperties,
  banner: {
    ...ellipsis,
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.02em",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  label: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  input: control,
  textarea: {
    ...control,
    minHeight: 260,
    resize: "vertical",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 12.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  jsonHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  badge: { fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  reason: { fontSize: 12, color: "var(--crit)", lineHeight: 1.4 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  blocked: { fontSize: 12, color: "var(--text-secondary)", width: "100%", textAlign: "right" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", lineHeight: 1.4, padding: "0 24px 14px" } satisfies CSSProperties,
  loading: { padding: "24px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
