/* EvalRunControl — "Run eval (n)" with a cost confirmation (Spec B AC-1),
   live "k / n cases" while a suite runs (AC-2) and refusal / partial / failed
   text (AC-3). The only mutating request here is the confirmed POST (NFR-3).
   Owner-aware (Spec G2): a skill owner runs through `host` and the skill routes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { formatCostUsd } from "@/lib/format";
import {
  useEvalRun,
  useOwnerEvalCases,
  useOwnerEvalRuns,
  useStartEvalRun,
  useStartSkillEvalRun,
  type EvalHost,
} from "@/lib/hooks/eval";
import { referenceSuite, resolveOwner, skillRefusalKey, type OwnerProps } from "../helpers";
import { EvalRunConfirm } from "../EvalRunConfirm";
import { casesDone, refusalKey, runningRun } from "./helpers";
import { s } from "./styles";

export type EvalRunControlProps = OwnerProps & {
  /** Host agent of a skill suite; `null`/absent disables the button for a skill. */
  host?: EvalHost | null;
  /** Id of the element that explains why running is disabled (no host). */
  runHintId?: string;
  /** `runAll` reads "Run all evals" (the case-list heading row); default "Run eval (n)". */
  label?: "runEval" | "runAll";
  /** Rendered first in the control row, before the run button (the case-list heading). */
  heading?: React.ReactNode;
  /** Rendered after the run button (New eval case, Copy from agent case). */
  actions?: React.ReactNode;
};

export function EvalRunControl(props: EvalRunControlProps) {
  const { host, runHintId, label = "runEval", heading, actions } = props;
  const owner = resolveOwner(props);
  const isSkill = owner.kind === "skill";
  const t = useTranslations("eval");
  const cases = useOwnerEvalCases(owner);
  const history = useOwnerEvalRuns(owner);
  const startAgent = useStartEvalRun(isSkill ? null : owner.id);
  const startSkill = useStartSkillEvalRun(isSkill ? owner.id : null);
  const start = isSkill ? startSkill : startAgent;
  const noHost = isSkill && !host;
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
  const lastCost = formatCostUsd(referenceSuite(history.data)?.cost_usd);

  const onConfirm = () => {
    setConfirming(false);
    const onSuccess = (created: { id: string }) => setTrackedId(created.id);
    if (isSkill) {
      if (host) startSkill.mutate(host.id, { onSuccess });
    } else {
      startAgent.mutate(undefined, { onSuccess });
    }
  };

  let notice: React.ReactNode = null;
  if (start.isError) {
    notice = (
      <p role="alert" style={s.error}>
        {isSkill
          ? t(`skillEvals.refusals.${skillRefusalKey(start.error)}`)
          : t(`evalsTab.refusals.${refusalKey(start.error)}`)}
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
      <div style={heading ? s.headingRow : s.row}>
        {heading}
        {heading && <span style={s.spacer} />}
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
            disabled={n === 0 || start.isPending || noHost}
            aria-describedby={noHost ? runHintId : undefined}
            loading={start.isPending}
            onClick={() => {
              start.reset();
              setConfirming(true);
            }}
          >
            {label === "runAll" ? t("evalsTab.runAll") : t("evalsTab.runEval", { count: n })}
          </Button>
        )}
        {actions}
      </div>
      {notice}
      {confirming && (
        <EvalRunConfirm
          count={n}
          lastCost={lastCost}
          host={isSkill ? (host ?? undefined) : undefined}
          onConfirm={onConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
