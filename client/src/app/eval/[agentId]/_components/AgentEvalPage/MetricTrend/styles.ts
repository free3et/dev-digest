import type { CSSProperties } from "react";

export const CHART_HEIGHT = 240;
export const LINE_WIDTH = 2;

export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "14px 16px",
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 10,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  title: { margin: 0 } satisfies CSSProperties,
  legend: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-primary)" } satisfies CSSProperties,
  swatch: { display: "inline-block", width: 14, height: LINE_WIDTH + 1, borderRadius: 2 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  chart: { width: "100%", height: CHART_HEIGHT } satisfies CSSProperties,
  tooltip: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 10px",
    fontSize: 12.5,
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  tooltipHeader: { fontWeight: 700 } satisfies CSSProperties,
} as const;
