/* InputTabs — the frozen input of the would-be case, read-only (Spec C AC-11).
   Native tablist/tab/tabpanel roles: the vendored `Tabs` has none. Everything
   is rendered as plain text, never Markdown or HTML (untrusted PR text). */
"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseDraft } from "@devdigest/shared";
import { INPUT_TABS, type InputTab } from "../constants";
import { s } from "./styles";

export function InputTabs({
  draft,
}: {
  draft: Pick<EvalCaseDraft, "input_diff" | "input_files" | "input_meta">;
}) {
  const t = useTranslations("eval.caseEditor");
  const [tab, setTab] = useState<InputTab>("diff");
  const uid = useId();
  const tabId = (k: InputTab) => `${uid}-tab-${k}`;
  const panelId = (k: InputTab) => `${uid}-panel-${k}`;
  const meta = draft.input_meta;

  return (
    <div style={s.wrap}>
      <div style={s.label}>{t("inputLabel")}</div>
      <div role="tablist" aria-label={t("tabsLabel")} style={s.list}>
        {INPUT_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={tabId(k)}
            aria-selected={tab === k}
            aria-controls={panelId(k)}
            style={s.tab(tab === k)}
            onClick={() => setTab(k)}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} style={s.panel}>
        {tab === "diff" && (
          // Focusable so a keyboard user can scroll a long diff.
          <pre tabIndex={0} style={s.diff}>
            {draft.input_diff}
          </pre>
        )}
        {tab === "files" && (
          <ul style={s.files}>
            {draft.input_files.map((f) => (
              <li key={f} title={f} style={s.file}>
                {f}
              </li>
            ))}
          </ul>
        )}
        {tab === "prMeta" && (
          <dl style={s.meta}>
            <dt style={s.term}>{t("prMeta.number")}</dt>
            <dd style={s.value}>#{meta.pr_number}</dd>
            <dt style={s.term}>{t("prMeta.title")}</dt>
            <dd style={s.value}>{meta.pr_title}</dd>
            <dt style={s.term}>{t("prMeta.repo")}</dt>
            <dd style={s.value}>{meta.repo}</dd>
            <dt style={s.term}>{t("prMeta.body")}</dt>
            <dd style={s.value}>
              {meta.pr_body ? <p style={s.body}>{meta.pr_body}</p> : <span style={s.muted}>{t("prMeta.noBody")}</span>}
            </dd>
          </dl>
        )}
      </div>
    </div>
  );
}
