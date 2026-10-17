/** Input tabs of the modal, in display order (Spec C C-7). Keys match `eval.caseEditor.tabs.*`. */
export const INPUT_TABS = ["diff", "files", "prMeta"] as const;
export type InputTab = (typeof INPUT_TABS)[number];

/** Refusal codes (Spec A R-1, Spec C R-3) the modal has a text for under `eval.caseEditor.errors.*`. */
export const MODAL_ERROR_CODES = [
  "finding_undecided",
  "no_agent",
  "duplicate",
  "patch_unavailable",
  "not_found",
  "validation_error",
  "file_not_in_diff",
  "kind_mismatch",
  "invalid_diff",
  "too_many_cases",
  "eval_run_in_progress",
] as const;
