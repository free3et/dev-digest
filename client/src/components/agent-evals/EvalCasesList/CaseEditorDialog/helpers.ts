import type { EvalCase, EvalCaseDraft, EvalExpectationInput } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import type { EvalOwner } from "@/lib/hooks/eval";
import {
  modalErrorKey,
  toJsonText,
  validateExpectationText,
  type JsonValidity,
  type ModalErrorKey,
} from "@/components/finding-card/EvalCaseControl/EvalCaseModal/helpers";
import { skillRefusalKey, type SkillRefusalKey } from "../../helpers";

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

const SKILL_CODES: readonly string[] = [
  "host_required",
  "host_not_found",
  "host_not_allowed",
  "not_agent_case",
  "eval_run_in_progress",
  "no_cases",
  "too_many_cases",
  "invalid_diff",
  "not_found",
];

export type EditorErrorKey =
  | { scope: "editor"; key: ModalErrorKey }
  | { scope: "skill"; key: SkillRefusalKey };

/**
 * Which text a failed editor request shows. A skill owner gets the skill
 * wording (`skillEvals.refusals.*`) for the G1 codes; everything else, and every
 * agent owner, keeps the editor's own mapping (`modalErrorKey`).
 */
export function editorErrorKey(owner: EvalOwner, err: unknown): EditorErrorKey {
  if (owner.kind === "skill" && err instanceof ApiError && SKILL_CODES.includes(err.code ?? "")) {
    return { scope: "skill", key: skillRefusalKey(err) };
  }
  return { scope: "editor", key: modalErrorKey(err) };
}
