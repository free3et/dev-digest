/* EvalCaseModal — review an eval case before saving (Spec C). Reads the
   server-derived draft, lets the user edit the name and the expectation,
   dry-runs it (one paid call, nothing stored) and saves on request. Mounted
   only while open, so closing it discards every edit and result (AC-21). */
"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateEvalCase, useEvalCaseDraft, useEvalDryRun } from "@/lib/hooks/eval";
import { useDialogA11y } from "@/lib/hooks/dialog-a11y";
import { InputTabs } from "./InputTabs";
import { RunResult } from "./RunResult";
import { bannerKey, modalErrorKey, saveBlockReason, subtitleKey, toJsonText, validateExpectationText } from "./helpers";
import { s } from "./styles";

export interface EvalCaseModalProps {
  findingId: string;
  agentId: string;
  onClose: () => void;
  /** The case was stored (201). The caller closes the modal. */
  onSaved: () => void;
}

export function EvalCaseModal({ findingId, agentId, onClose, onSaved }: EvalCaseModalProps) {
  const t = useTranslations("eval.caseEditor");
  const draftQuery = useEvalCaseDraft(findingId);
  const dryRun = useEvalDryRun(findingId);
  const create = useCreateEvalCase(agentId);
  const draft = draftQuery.data;

  // Edits override the draft; null = untouched, so nothing mirrors server state.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [jsonEdit, setJsonEdit] = useState<string | null>(null);
  const runningRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const nameId = `${uid}-name`;
  const jsonId = `${uid}-json`;
  const jsonStateId = `${uid}-json-state`;
  const hintId = `${uid}-hint`;

  useDialogA11y({ containerRef, labelId: titleId, initialFocusRef: nameRef, ready: !!draft, onClose });

  const name = nameEdit ?? draft?.name ?? "";
  const jsonText = jsonEdit ?? (draft ? toJsonText(draft.expected_output) : "");
  const validity = useMemo(
    () => (draft ? validateExpectationText(jsonText, draft) : null),
    [draft, jsonText],
  );
  const blocked = validity ? saveBlockReason(name, validity) : null;
  const canRun = !!validity?.ok && !dryRun.isPending;
  const canSave = !!draft && blocked === null && !create.isPending;

  function run() {
    if (!validity?.ok || dryRun.isPending || runningRef.current) return;
    runningRef.current = true; // a second click before the re-render sends nothing
    dryRun.mutate(validity.value, { onSettled: () => (runningRef.current = false) });
  }

  function save() {
    if (!validity?.ok || !canSave) return;
    create.mutate(
      { findingId, overrides: { name: name.trim(), expected_output: validity.value } },
      { onSuccess: onSaved },
    );
  }

  const kind = draft?.expected_output.kind;
  const title = draft ? t("caseTitle", { name: draft.name }) : t("loadingDraft");

  // Portal to <body>: the finding card sits inside stacking contexts (accordion,
  // cards) that paint later siblings over a position:fixed child, which made the
  // dialog look translucent. The vendored Modal cannot be changed, so lift it here.
  return createPortal(
    <div ref={containerRef}>
      <Modal
        width={980}
        title={
          <span id={titleId} style={s.title} title={title}>
            {title}
          </span>
        }
        subtitle={kind ? <span style={s.subtitle}>{t(subtitleKey(kind))}</span> : undefined}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <span style={s.spacer} />
            <span id={hintId} style={s.hint}>
              {t("costHint")}
            </span>
            <Button kind="secondary" icon="Play" aria-describedby={hintId} disabled={!canRun} loading={dryRun.isPending} onClick={run}>
              {dryRun.isPending ? t("running") : t("runCase")}
            </Button>
            <Button kind="primary" disabled={!canSave} loading={create.isPending} onClick={save}>
              {create.isPending ? t("saving") : t("save")}
            </Button>
            {draft && blocked && <span style={s.blocked}>{t(`saveBlocked.${blocked}`)}</span>}
          </div>
        }
      >
        {draftQuery.isError && (
          <div role="alert" style={s.error}>
            {t(`errors.${modalErrorKey(draftQuery.error)}`)}
          </div>
        )}
        {!draft && !draftQuery.isError && <div style={s.loading}>{t("loadingDraft")}</div>}
        {draft && validity && (
          <div style={s.columns}>
            <div style={s.column}>
              <div
                style={s.banner}
                title={`${draft.expected_output.title} · ${draft.expected_output.file}:${draft.expected_output.start_line}`}
              >
                {t(bannerKey(draft.expected_output.kind), {
                  title: draft.expected_output.title,
                  file: draft.expected_output.file,
                  line: draft.expected_output.start_line,
                })}
              </div>
              <div style={s.field}>
                <label htmlFor={nameId} style={s.label}>
                  {t("nameLabel")}
                </label>
                <input
                  id={nameId}
                  ref={nameRef}
                  required
                  maxLength={500}
                  value={name}
                  onChange={(e) => setNameEdit(e.target.value)}
                  style={s.input}
                />
              </div>
              <InputTabs draft={draft} />
            </div>
            <div style={s.column}>
              <div style={s.jsonHead}>
                <label htmlFor={jsonId} style={s.label}>
                  {t("expectedOutput")}
                </label>
                <span id={jsonStateId} style={s.badge}>
                  {validity.ok ? t("validJson") : t("invalidJson")}
                </span>
                <Button kind="ghost" size="sm" onClick={() => setJsonEdit(null)}>
                  {t("findingSkeleton")}
                </Button>
              </div>
              <textarea
                id={jsonId}
                spellCheck={false}
                value={jsonText}
                aria-invalid={!validity.ok}
                aria-describedby={jsonStateId}
                onChange={(e) => setJsonEdit(e.target.value)}
                style={s.textarea}
              />
              {!validity.ok && <div style={s.reason}>{t(`json.${validity.reason}`, validity.params)}</div>}
              <RunResult
                result={dryRun.data ?? null}
                errorKey={dryRun.isError ? modalErrorKey(dryRun.error) : null}
              />
            </div>
          </div>
        )}
        {create.isError && (
          <div role="alert" style={s.error}>
            {t(`errors.${modalErrorKey(create.error)}`)}
          </div>
        )}
      </Modal>
    </div>,
    document.body,
  );
}
