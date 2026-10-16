import type { CSSProperties } from "react";

/** Hidden from sight, kept in the accessibility tree (headers, abbreviations' full names). */
export const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};
