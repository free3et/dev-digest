import type { CSSProperties } from "react";

/** Direction is carried by the glyph and the accessible name; colour only reinforces it. */
export const s = {
  up: { color: "var(--ok, #2ea043)", whiteSpace: "nowrap" } satisfies CSSProperties,
  down: { color: "var(--crit, #f85149)", whiteSpace: "nowrap" } satisfies CSSProperties,
  flat: { color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
