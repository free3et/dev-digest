import { EvalExpectationInput } from "@devdigest/shared";
import type { EvalCaseDraft, EvalDryRunResult, EvalExpectationKind } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { EMPTY, formatCostUsd } from "@/lib/format";
import { MODAL_ERROR_CODES } from "./constants";

/** Keys under `eval.caseEditor.json.*`. */
export type JsonReason = "parse" | "shape" | "unknownKey" | "range" | "fileMismatch" | "kindMismatch";

export type JsonValidity =
  | { ok: true; value: EvalExpectationInput }
  | { ok: false; reason: JsonReason; params: Record<string, string> };

/** The expectation as the editable JSON text (indented, as stored). */
export function toJsonText(e: EvalExpectationInput): string {
  return JSON.stringify(e, null, 2);
}

function fail(reason: JsonReason, params: Record<string, string> = {}): JsonValidity {
  return { ok: false, reason, params };
}

/**
 * Client-side R-3 check of the Expected output text (AC-13): parse, shared
 * `EvalExpectationInput` shape, then the two checks the server repeats —
 * `file` equals the frozen diff's file, `kind` equals the draft's kind.
 */
export function validateExpectationText(
  text: string,
  draft: Pick<EvalCaseDraft, "input_files" | "expected_output">,
): JsonValidity {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("parse");
  }
  const parsed = EvalExpectationInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) return fail("shape", { path: "expected_output" });
    const path = issue.path.join(".") || "expected_output";
    if (issue.code === "unrecognized_keys") {
      const keys = (issue as { keys?: string[] }).keys ?? [];
      return fail("unknownKey", { path: keys.join(", ") || path });
    }
    if (issue.code === "custom") return fail("range");
    return fail("shape", { path });
  }
  const file = draft.input_files[0];
  if (file !== undefined && parsed.data.file !== file) return fail("fileMismatch", { file });
  const kind = draft.expected_output.kind;
  if (parsed.data.kind !== kind) return fail("kindMismatch", { kind });
  return { ok: true, value: parsed.data };
}

/** `eval.caseEditor.banner.*` key for the draft's kind. */
export function bannerKey(kind: EvalExpectationKind): "banner.mustFind" | "banner.mustNotFlag" {
  return kind === "must_find" ? "banner.mustFind" : "banner.mustNotFlag";
}

/** `eval.caseEditor.subtitle.*` key for the draft's kind. */
export function subtitleKey(kind: EvalExpectationKind): "subtitle.mustFind" | "subtitle.mustNotFlag" {
  return kind === "must_find" ? "subtitle.mustFind" : "subtitle.mustNotFlag";
}

/** Which input blocks saving (AC-17): the name first, then the JSON; null = Save allowed. */
export function saveBlockReason(name: string, validity: JsonValidity): "name" | "json" | null {
  if (name.trim() === "") return "name";
  if (!validity.ok) return "json";
  return null;
}

export interface ResultView {
  headingKey: "lastRunPassed" | "lastRunFailed" | "result.lastRunErrored";
  errored: boolean;
  /** Expectation vs result sentence; null on `error`. */
  expected: { key: "result.expectedMustFind" | "result.expectedMustNotFlag"; count: number } | null;
  kept: number | null;
  dropped: number | null;
  /** Seconds with one decimal. */
  seconds: string;
  /** `formatCostUsd`, `EMPTY` when null. */
  cost: string;
  error: string | null;
}

/** Everything the result box renders, as plain values (AC-16). */
export function resultView(r: EvalDryRunResult): ResultView {
  const errored = r.outcome === "error";
  return {
    headingKey: errored ? "result.lastRunErrored" : r.pass ? "lastRunPassed" : "lastRunFailed",
    errored,
    expected: errored
      ? null
      : {
          key: r.expectation_kind === "must_find" ? "result.expectedMustFind" : "result.expectedMustNotFlag",
          count: r.matched_count ?? 0,
        },
    kept: errored ? null : r.findings_kept,
    dropped: errored ? null : r.findings_dropped,
    seconds: (r.duration_ms / 1000).toFixed(1),
    cost: r.cost_usd == null ? EMPTY : formatCostUsd(r.cost_usd),
    error: errored ? r.error : null,
  };
}

export type ModalErrorKey = (typeof MODAL_ERROR_CODES)[number] | "rate_limited" | "payload_too_large" | "network_error" | "unknown";

/**
 * Map a failed draft / dry-run / save call to an `eval.caseEditor.errors.*`
 * key: `ApiError.code` for R-1 / R-3, status for 429 and 413 (the 413 body
 * keeps `internal_error`), status 0 or a non-ApiError for the network.
 */
export function modalErrorKey(err: unknown): ModalErrorKey {
  if (!(err instanceof ApiError)) return "network_error";
  if (err.status === 0) return "network_error";
  const known = MODAL_ERROR_CODES.find((c) => c === err.code);
  if (known) return known;
  if (err.status === 429) return "rate_limited";
  if (err.status === 413) return "payload_too_large";
  return "unknown";
}
