/* SkillEvalsTab — the Evals tab of a skill (Spec G2): host picker, the case list
   (heading, Run all evals, New eval case), regression banner and run history, with Compare as a dialog over the
   tab. It composes the same shared parts the agent Evals tab uses, with a skill
   owner. The host state is owned by `SkillDetail` so the header's "Run on evals"
   button and this tab agree. */
"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { EvalCasesList } from "@/components/agent-evals/EvalCasesList";
import { EvalCompare } from "@/components/agent-evals/EvalCompare";
import { EvalRunHistory } from "@/components/agent-evals/EvalRunHistory";
import { RegressionBanner } from "@/components/agent-evals/RegressionBanner";
import type { SkillEvalHostState } from "../../hooks/useSkillEvalHost";
import { CopyCaseDialog } from "./CopyCaseDialog";
import { HostPicker } from "./HostPicker";
import { s } from "./styles";

export function SkillEvalsTab({ skill, hostState }: { skill: Skill; hostState: SkillEvalHostState }) {
  const t = useTranslations("eval");
  const uid = useId();
  const hintId = `${uid}-host-hint`;
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const owner = { kind: "skill", id: skill.id } as const;
  const { hostList, hosts, hostId, host, setHostId } = hostState;
  return (
    <section aria-labelledby={`${uid}-title`} data-skill-id={skill.id} style={s.wrap}>
      <header style={s.header}>
        <h2 id={`${uid}-title`} style={s.title}>
          {t("skillEvals.title")}
        </h2>
        <p style={s.subtitle}>{t("skillEvals.subtitle")}</p>
      </header>
      <HostPicker agents={hostList} value={hostId} onChange={setHostId} hintId={hintId} />
      <EvalCasesList
        owner={owner}
        host={host}
        runHintId={hintId}
        extraActions={<CopyCaseDialog skillId={skill.id} agents={hostList} />}
      />
      <RegressionBanner owner={owner} />
      <EvalRunHistory owner={owner} hosts={hosts} onCompare={setCompareIds} />
      {compareIds && <EvalCompare owner={owner} hosts={hosts} runIds={compareIds} onClose={() => setCompareIds(null)} />}
    </section>
  );
}
