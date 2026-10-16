import type { CSSProperties } from "react";

/**
 * Small uppercase caption (Spec E AC-13). Uppercase is styling only; the DOM
 * text stays sentence case. `--text-secondary`, not `--text-muted`: muted fails
 * 4.5:1 for small text in both themes.
 */
export const EVAL_CAPTION_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

/** Identity colour per metric (Spec E). Never carries meaning alone: a caption always names it.
 *  "orange" is `--warn`: there is no orange token and vendor is untouched. */
export const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
} as const;

export type MetricField = keyof typeof METRIC_COLOR;
