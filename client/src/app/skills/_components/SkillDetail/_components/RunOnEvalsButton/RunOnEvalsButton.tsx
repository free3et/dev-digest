/* RunOnEvalsButton — "Run on evals" in the skill header, on every tab (Spec G2
   AC-9, AC-10). It opens the shared cost confirmation and, on confirm, starts a
   skill suite through the chosen host and switches to the Evals tab, where the
   run is adopted and its progress shown. Disabled reasons are text, referenced
   by aria-describedby, never colour alone. */
"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { formatCostUsd } from "@/lib/format";
import {
  useEvalRun,
  useSkillEvalCases,
  useSkillEvalRuns,
  useStartSkillEvalRun,
  type EvalHost,
} from "@/lib/hooks/eval";
import { VISUALLY_HIDDEN } from "@/lib/visually-hidden";
import { EvalRunConfirm } from "@/components/agent-evals/EvalRunConfirm";
import { runningRun } from "@/components/agent-evals/EvalRunControl/helpers";
import { referenceSuite, skillRefusalKey } from "@/components/agent-evals/helpers";
import { disabledReason } from "./helpers";
import { s } from "./styles";

export function RunOnEvalsButton({
  skillId,
  host,
  onStarted,
}: {
  skillId: string;
  host: EvalHost | null;
  /** Called after the run was accepted; the page switches to the Evals tab. */
  onStarted: () => void;
}) {
  const t = useTranslations();
  const cases = useSkillEvalCases(skillId);
  const history = useSkillEvalRuns(skillId);
  const start = useStartSkillEvalRun(skillId);
  const [confirming, setConfirming] = useState(false);
  const reasonId = useId();

  // Polls the running suite (same query key as the tab's run control), so the
  // button re-enables, and the history refreshes, once it finishes.
  const running = runningRun(history.data);
  useEvalRun(running?.id);

  const n = cases.data?.length ?? 0;
  const reason = disabledReason({ running: !!running, caseCount: n, hasHost: !!host });
  const reasonText = reason ? t(`skills.detail.runOnEvals.${reason}`) : null;
  const lastCost = formatCostUsd(referenceSuite(history.data)?.cost_usd);

  const onConfirm = () => {
    setConfirming(false);
    if (host) start.mutate(host.id, { onSuccess: onStarted });
  };

  return (
    <div style={s.wrap}>
      <Button
        kind="primary"
        size="sm"
        icon="Play"
        disabled={reason !== null || start.isPending}
        loading={start.isPending}
        aria-describedby={reasonText ? reasonId : undefined}
        onClick={() => {
          start.reset();
          setConfirming(true);
        }}
      >
        {t("skills.detail.runOnEvals.label")}
      </Button>
      {reasonText && (
        <span id={reasonId} style={VISUALLY_HIDDEN}>
          {reasonText}
        </span>
      )}
      {start.isError && (
        <p role="alert" style={s.error}>
          {t(`eval.skillEvals.refusals.${skillRefusalKey(start.error)}`)}
        </p>
      )}
      {confirming && host && (
        <EvalRunConfirm
          count={n}
          lastCost={lastCost}
          host={host}
          onConfirm={onConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
