import type { CSSProperties } from "react";
import { EVAL_CAPTION_STYLE } from "@/components/eval-metric";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 } satisfies CSSProperties,
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  label: EVAL_CAPTION_STYLE as CSSProperties,
  values: { fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" } satisfies CSSProperties,
  delta: { fontSize: 12.5, whiteSpace: "nowrap" } satisfies CSSProperties,
  up: { color: "var(--ok, #2ea043)" } satisfies CSSProperties,
  down: { color: "var(--crit, #f85149)" } satisfies CSSProperties,
  flat: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
