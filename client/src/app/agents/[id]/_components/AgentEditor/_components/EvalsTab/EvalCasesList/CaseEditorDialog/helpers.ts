import type { EvalCase, EvalCaseDraft, EvalExpectationInput } from "@devdigest/shared";
import { toJsonText, validateExpectationText, type JsonValidity } from "@/components/finding-card/EvalCaseControl/EvalCaseModal/helpers";

/** The expectation a hand-written case starts from ("Finding skeleton"). */
export const NEW_CASE_SKELETON: EvalExpectationInput = {
  kind: "must_find",
  file: "src/example.ts",
  start_line: 1,
  end_line: 1,
  title: "What the agent must (not) report",
  severity: "WARNING",
  category: "general",
};

/** The stored expectation without the server-owned `source`, as editable JSON text. */
export function storedJsonText(c: EvalCase): string {
  const { source: _source, ...editable } = c.expected_output;
  return toJsonText(editable);
}

/**
 * Validity of the Expected output text of the case editor. Unlike the finding
 * modal, the kind is NOT pinned (the user is redefining the case); the file is
 * pinned to the frozen diff's file when editing (`frozenFile`) and free when
 * writing a new case (`null`).
 */
export function validateCaseJson(text: string, frozenFile: string | null): JsonValidity {
  let kind: "must_find" | "must_not_flag" = "must_find";
  try {
    const raw = JSON.parse(text) as { kind?: unknown } | null;
    if (raw?.kind === "must_not_flag") kind = "must_not_flag";
  } catch {
    /* validateExpectationText reports the parse error */
  }
  const draft = {
    input_files: frozenFile ? [frozenFile] : [],
    expected_output: { kind },
  } as Pick<EvalCaseDraft, "input_files" | "expected_output">;
  return validateExpectationText(text, draft);
}
