import type { CSSProperties } from "react";

/** Line thickness in px. At least 2 so the line stays visible against the card (Spec F NFR-1). */
export const STROKE_WIDTH = 2;

export const s = {
  wrap: { display: "inline-flex", flexShrink: 0, lineHeight: 0 } satisfies CSSProperties,
} as const;
