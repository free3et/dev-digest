/* CaseEditorDialog — edit a stored eval case or write a new one by hand, in the
   same two-column layout as the finding modal: name + frozen input on the left,
   the Expected output JSON and the last run on the right. Editing keeps the
   frozen diff (read-only); a new case takes the pasted hunks. "Run case" scores
   the stored case against the JSON on screen (one paid call, nothing stored);
   "Run on save" runs it once the save succeeded. Mounted only while open. */
"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalCase, EvalDryRunResult, EvalExpectationInput } from "@devdigest/shared";
import { useDialogA11y } from "@/lib/hooks/dialog-a11y";
import {
  useCreateManualEvalCase,
  useCreateSkillManualEvalCase,
  useRunEvalCase,
  useUpdateEvalCase,
  type EvalHost,
} from "@/lib/hooks/eval";
import { InputTabs } from "@/components/finding-card/EvalCaseControl/EvalCaseModal/InputTabs";
import { RunResult } from "@/components/finding-card/EvalCaseControl/EvalCaseModal/RunResult";
import { modalErrorKey, saveBlockReason } from "@/components/finding-card/EvalCaseControl/EvalCaseModal/helpers";
import { s } from "@/components/finding-card/EvalCaseControl/EvalCaseModal/styles";
import { resolveOwner, type OwnerProps } from "../../helpers";
import { NEW_CASE_SKELETON, editorErrorKey, storedJsonText, validateCaseJson } from "./helpers";

export type CaseEditorDialogProps = OwnerProps & {
  /** The case to edit; omit to write a new one. */
  evalCase?: EvalCase;
  /** Host agent that runs a skill-owned case; `null`/absent disables running there. */
  host?: EvalHost | null;
  onClose: () => void;
};

export function CaseEditorDialog(props: CaseEditorDialogProps) {
  const { evalCase, host, onClose } = props;
  const owner = resolveOwner(props);
  const isSkill = owner.kind === "skill";
  const t = useTranslations("eval.caseEditor");
  const tEval = useTranslations("eval");
  const editing = !!evalCase;
  const update = useUpdateEvalCase(owner);
  const createAgent = useCreateManualEvalCase(isSkill ? null : owner.id);
  const createSkill = useCreateSkillManualEvalCase(isSkill ? owner.id : null);
  const create = isSkill ? createSkill : createAgent;
  const run = useRunEvalCase();
  const canHost = !isSkill || !!host;
  const hostId = isSkill ? host?.id : undefined;

  const skeletonText = useMemo(
    () => (evalCase ? storedJsonText(evalCase) : JSON.stringify(NEW_CASE_SKELETON, null, 2)),
    [evalCase],
  );
  const [name, setName] = useState(evalCase?.name ?? "");
  const [jsonText, setJsonText] = useState(skeletonText);
  const [patch, setPatch] = useState("");
  const [runOnSaveEdit, setRunOnSaveEdit] = useState<boolean | null>(null);
  const runOnSave = (runOnSaveEdit ?? true) && canHost;
  const [savedCase, setSavedCase] = useState<EvalCase | null>(null);
  const [saveResult, setSaveResult] = useState<EvalDryRunResult | null>(null);
  const runningRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const nameId = `${uid}-name`;
  const jsonId = `${uid}-json`;
  const jsonStateId = `${uid}-json-state`;
  const patchId = `${uid}-patch`;
  const hintId = `${uid}-hint`;

  useDialogA11y({ containerRef, labelId: titleId, initialFocusRef: nameRef, ready: true, onClose });

  const validity = useMemo(
    () => validateCaseJson(jsonText, evalCase?.input_files[0] ?? null),
    [jsonText, evalCase],
  );
  const patchMissing = !editing && patch.trim() === "";
  const blocked = saveBlockReason(name, validity);
  const busy = update.isPending || create.isPending || run.isPending;
  const saved = savedCase !== null;
  const canSave = blocked === null && !patchMissing && !busy && !saved;
  const canRun = editing && validity.ok && !busy && canHost;

  const execRun = (caseId: string, expected?: EvalExpectationInput) =>
    run.mutate(
      { caseId, expectedOutput: expected, agentId: hostId },
      { onSuccess: (r) => setSaveResult(r), onSettled: () => (runningRef.current = false) },
    );

  function runCase() {
    if (!evalCase || !validity.ok || busy || runningRef.current) return;
    runningRef.current = true;
    execRun(evalCase.id, validity.value);
  }

  function afterSave(c: EvalCase) {
    if (!runOnSave) return onClose();
    setSavedCase(c);
    runningRef.current = true;
    execRun(c.id);
  }

  function save() {
    if (!validity.ok || !canSave) return;
    if (evalCase) {
      update.mutate(
        { caseId: evalCase.id, body: { name: name.trim(), expected_output: validity.value } },
        { onSuccess: afterSave },
      );
    } else {
      create.mutate(
        { name: name.trim(), patch, expected_output: validity.value },
        { onSuccess: afterSave },
      );
    }
  }

  const title = editing ? t("caseTitle", { name: evalCase.name }) : t("newTitle");
  const result = saveResult ?? run.data ?? null;
  const requestError = update.error ?? create.error ?? run.error;
  const errorText = (err: unknown) => {
    const k = editorErrorKey(owner, err);
    return k.scope === "skill" ? tEval(`skillEvals.refusals.${k.key}`) : t(`errors.${k.key}`);
  };
  const showError = update.isError || create.isError || run.isError;

  return createPortal(
    <div ref={containerRef}>
      <Modal
        width={980}
        title={
          <span id={titleId} style={s.title} title={title}>
            {title}
          </span>
        }
        subtitle={<span style={s.subtitle}>{t(editing ? "editSubtitle" : "newSubtitle")}</span>}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                role="switch"
                checked={runOnSave}
                disabled={saved || !canHost}
                onChange={(e) => setRunOnSaveEdit(e.target.checked)}
              />
              {t("runOnSave")}
            </label>
            <span style={s.spacer} />
            <span id={hintId} style={s.hint}>
              {!canHost ? tEval("skillEvals.host.hint") : editing ? t("costHint") : t("runAfterSaveHint")}
            </span>
            <Button kind="ghost" onClick={onClose}>
              {saved ? t("close") : t("cancel")}
            </Button>
            <Button
              kind="secondary"
              icon="Play"
              aria-describedby={hintId}
              disabled={!canRun}
              loading={run.isPending}
              onClick={runCase}
            >
              {run.isPending ? t("running") : t("runCase")}
            </Button>
            <Button kind="primary" disabled={!canSave} loading={update.isPending || create.isPending} onClick={save}>
              {update.isPending || create.isPending ? t("saving") : saved ? t("savedBadge") : t("save")}
            </Button>
            {blocked && !saved && <span style={s.blocked}>{t(`saveBlocked.${blocked}`)}</span>}
          </div>
        }
      >
        <div style={s.columns}>
          <div style={s.column}>
            <div style={s.field}>
              <label htmlFor={nameId} style={s.label}>
                {t("nameLabel")}
              </label>
              <input
                id={nameId}
                ref={nameRef}
                required
                maxLength={500}
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={s.input}
              />
            </div>
            {evalCase ? (
              <InputTabs draft={evalCase} />
            ) : (
              <div style={s.field}>
                <label htmlFor={patchId} style={s.label}>
                  {t("diffEditLabel")}
                </label>
                <textarea
                  id={patchId}
                  spellCheck={false}
                  value={patch}
                  placeholder={t("diffPlaceholder")}
                  onChange={(e) => setPatch(e.target.value)}
                  style={s.textarea}
                />
              </div>
            )}
          </div>
          <div style={s.column}>
            <div style={s.jsonHead}>
              <label htmlFor={jsonId} style={s.label}>
                {t("expectedOutput")}
              </label>
              <span id={jsonStateId} style={s.badge}>
                {validity.ok ? t("validJson") : t("invalidJson")}
              </span>
              <Button kind="ghost" size="sm" onClick={() => setJsonText(skeletonText)}>
                {t("findingSkeleton")}
              </Button>
            </div>
            <textarea
              id={jsonId}
              spellCheck={false}
              value={jsonText}
              aria-invalid={!validity.ok}
              aria-describedby={jsonStateId}
              onChange={(e) => setJsonText(e.target.value)}
              style={s.textarea}
            />
            {!validity.ok && <div style={s.reason}>{t(`json.${validity.reason}`, validity.params)}</div>}
            <RunResult
              result={result}
              errorKey={run.isError ? modalErrorKey(run.error) : null}
              errorText={run.isError ? errorText(run.error) : null}
            />
          </div>
        </div>
        {showError && !run.isError && (
          <div role="alert" style={s.error}>
            {errorText(requestError)}
          </div>
        )}
      </Modal>
    </div>,
    document.body,
  );
}
