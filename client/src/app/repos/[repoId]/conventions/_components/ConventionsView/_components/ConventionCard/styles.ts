import type { CSSProperties } from "react";

const fill = (pct: number): string => {
  if (pct >= 80) return "var(--ok)";
  if (pct >= 65) return "#eab308";
  return "var(--text-muted)";
};

export const s = {
  card: {
    display: "flex",
    gap: 16,
    border: "1px solid var(--border)",
    borderLeft: "3px solid var(--ok)",
    borderRadius: 10,
    padding: "14px 16px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rule: { fontSize: 14, fontWeight: 600, lineHeight: 1.4, margin: 0 } satisfies CSSProperties,
  evidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    fontSize: 12,
  } satisfies CSSProperties,
  evidence: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  } satisfies CSSProperties,
  snippet: {
    margin: "10px 0 0",
    padding: 12,
    borderRadius: 8,
    background: "var(--bg-surface)",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    overflow: "auto",
  } satisfies CSSProperties,
  confidence: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 99,
    background: "var(--border)",
    overflow: "hidden",
    maxWidth: 220,
  } satisfies CSSProperties,
  barFill: (pct: number): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    background: fill(pct),
  }),
  pct: { fontVariantNumeric: "tabular-nums", fontWeight: 600, minWidth: 36, textAlign: "right" } satisfies CSSProperties,
  side: { display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, width: 118 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 12 } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
