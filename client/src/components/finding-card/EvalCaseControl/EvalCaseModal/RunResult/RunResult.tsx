/* RunResult — the last dry-run's outcome as text (Spec C AC-16). Counts only:
   kept and dropped findings are untrusted LLM text and are never listed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalDryRunResult } from "@devdigest/shared";
import { resultView, type ModalErrorKey } from "../helpers";
import { s } from "./styles";

export function RunResult({
  result,
  errorKey,
  errorText,
}: {
  result: EvalDryRunResult | null;
  /** The dry-run request itself failed (429, network, a refusal). */
  errorKey: ModalErrorKey | null;
  /** Ready-made text that replaces the `errors.*` one (the skill owner's refusal wording). */
  errorText?: string | null;
}) {
  const t = useTranslations("eval.caseEditor");

  if (errorKey) {
    return (
      <div role="alert" style={s.box}>
        <span style={s.error}>{errorText ?? t(`errors.${errorKey}`)}</span>
      </div>
    );
  }
  if (!result) return null;

  const v = resultView(result);
  const details: string[] = [];
  if (v.expected) details.push(t(v.expected.key, { count: v.expected.count }));
  if (v.kept != null) details.push(t("result.kept", { count: v.kept }));
  if (v.dropped != null) details.push(t("result.dropped", { count: v.dropped }));
  details.push(t("result.duration", { seconds: v.seconds }));
  details.push(t("result.cost", { cost: v.cost }));

  return (
    <div role="status" style={s.box}>
      <strong style={s.heading}>{t(v.headingKey)}</strong>
      {details.map((d, i) => (
        <React.Fragment key={i}>
          <span aria-hidden="true" style={s.sep}>
            ·
          </span>
          <span>{d}</span>
        </React.Fragment>
      ))}
      {v.error && <span style={s.error}>{v.error}</span>}
    </div>
  );
}
