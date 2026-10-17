/** Per-case model call timeout (spec A NFR-2). */
export const EVAL_CASE_TIMEOUT_MS = 120_000;

/**
 * Output token cap of one case call. Large enough for a reasoning model's
 * thinking plus a Review JSON (server INSIGHTS 2026-10-09: deepseek-v4-flash
 * ends `finish_reason=length` with an empty body when the cap is too small).
 */
export const EVAL_MAX_OUTPUT_TOKENS = 8192;

/** More cases than this in one suite → 422 `too_many_cases` (spec A NG-7). */
export const EVAL_MAX_CASES = 100;

/** `GET /agents/:id/eval-runs` returns at most this many suites, newest first. */
export const EVAL_HISTORY_LIMIT = 50;

/** Per-minute rate limits (spec A NFR-4). */
export const EVAL_RUN_RATE_LIMIT = 5;
export const EVAL_CASE_CREATE_RATE_LIMIT = 30;
/** Spec C NFR-3: dry-run limit (each call is one paid model call). */
export const EVAL_DRY_RUN_RATE_LIMIT = 10;

/** Spec C NFR-4: request bodies of the draft/dry-run/create endpoints are capped at 16 KB (413). */
export const EVAL_BODY_LIMIT_BYTES = 16_384;

/** Body cap of the hand-written case (`POST /agents/:id/eval-cases`): carries a pasted patch. */
export const EVAL_MANUAL_BODY_LIMIT_BYTES = 262_144;

/**
 * Cap of `EvalExpectationInput.title` (shared contract). `Finding.title` is
 * uncapped, so `buildExpectation` truncates to this at the single derivation
 * point (Spec C plan R1).
 */
export const EVAL_EXPECTATION_TITLE_MAX = 500;

/** Case name = `<file>:<start_line> <title>`, the title cut to this many chars. */
export const EVAL_CASE_TITLE_MAX = 120;

/** Stored per-case / per-suite error text is cut to this many chars. */
export const EVAL_ERROR_MAX = 300;

/** Rounding of dashboard deltas (kills float noise such as 0.8 - 0.6). */
export const EVAL_DELTA_DECIMALS = 6;
