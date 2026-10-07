import type { CSSProperties } from "react";

export const s = {
  button: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 3,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "10px 12px",
    margin: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    color: "inherit",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  where: {
    fontSize: 12.5,
    color: "var(--accent-text)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  reason: {
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
