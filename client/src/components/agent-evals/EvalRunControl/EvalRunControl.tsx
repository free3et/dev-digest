/* EvalRunControl — "Run eval (n)" with a cost confirmation (Spec B AC-1),
   live "k / n cases" while a suite runs (AC-2) and refusal / partial / failed
   text (AC-3). The only mutating request here is the confirmed POST (NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { formatCostUsd } from "@/lib/format";
import { useAgentEvalCases, useAgentEvalRuns, useEvalRun, useStartEvalRun } from "@/lib/hooks/eval";
import { casesDone, lastFinishedRun, refusalKey, runningRun } from "./helpers";
import { s } from "./styles";

export function EvalRunControl({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const cases = useAgentEvalCases(agentId);
  const history = useAgentEvalRuns(agentId);
  const start = useStartEvalRun(agentId);
  const [confirming, setConfirming] = React.useState(false);
  const [trackedId, setTrackedId] = React.useState<string | null>(null);

  // A suite found running on load is adopted once; the id then stays tracked
  // after the run leaves `running`, so its partial / failed notice survives.
  const foundRunning = runningRun(history.data);
  if (foundRunning && foundRunning.id !== trackedId) setTrackedId(foundRunning.id);

  const detail = useEvalRun(trackedId);
  const run = detail.data ?? (start.data?.id === trackedId ? start.data : undefined) ?? foundRunning;
  const isRunning = run ? run.status === "running" : trackedId !== null && !detail.isError;

  const n = cases.data?.length ?? 0;
  const lastCost = formatCostUsd(lastFinishedRun(history.data)?.cost_usd);

  const onConfirm = () => {
    setConfirming(false);
    start.mutate(undefined, { onSuccess: (created) => setTrackedId(created.id) });
  };

  let notice: React.ReactNode = null;
  if (start.isError) {
    notice = (
      <p role="alert" style={s.error}>
        {t(`evalsTab.refusals.${refusalKey(start.error)}`)}
      </p>
    );
  } else if (run && run.status === "partial") {
    notice = (
      <p role="status" style={s.notice}>
        {t("evalsTab.partialNotice", { errored: run.cases_errored })}
      </p>
    );
  } else if (run && run.status === "failed") {
    notice = (
      <p role="status" style={s.error}>
        {run.error ? t("evalsTab.failedNotice", { reason: run.error }) : t("evalsTab.failedNoReason")}
      </p>
    );
  } else if (run && run.status === "done") {
    notice = (
      <p role="status" style={s.notice}>
        {t("evalsTab.finishedNotice", { passed: run.cases_passed, total: run.cases_total })}
      </p>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.row}>
        {isRunning ? (
          <p role="status" aria-live="polite" style={s.progress}>
            {t("evalsTab.progress", {
              completed: run ? casesDone(run) : 0,
              total: run ? run.cases_total : n,
            })}
          </p>
        ) : (
          <Button
            kind="primary"
            icon="Play"
            disabled={n === 0 || start.isPending}
            loading={start.isPending}
            onClick={() => {
              start.reset();
              setConfirming(true);
            }}
          >
            {t("evalsTab.runEval", { count: n })}
          </Button>
        )}
      </div>
      {notice}
      {confirming && (
        <Modal
          width={440}
          title={t("evalsTab.confirm.title", { count: n })}
          onClose={() => setConfirming(false)}
          footer={
            <div style={s.modalFooter}>
              <Button kind="secondary" onClick={() => setConfirming(false)}>
                {t("evalsTab.confirm.cancel")}
              </Button>
              <Button kind="primary" onClick={onConfirm}>
                {t("evalsTab.confirm.confirm")}
              </Button>
            </div>
          }
        >
          <p style={s.modalBody}>{t("evalsTab.confirm.body", { cost: lastCost })}</p>
        </Modal>
      )}
    </div>
  );
}
