import type { CSSProperties } from "react";

export const s = {
  modalBody: {
    margin: 0,
    padding: "18px 24px",
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
