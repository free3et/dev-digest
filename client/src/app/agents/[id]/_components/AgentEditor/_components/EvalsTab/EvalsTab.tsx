/* Evals tab of the agent editor: run control, cases, the regression banner and
   the run history. Compare opens as a dialog over the tab (Spec D), so the
   history stays rendered with its selection while it is open. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EvalCasesList } from "./EvalCasesList";
import { EvalCompare } from "@/components/agent-evals/EvalCompare";
import { EvalRunControl } from "@/components/agent-evals/EvalRunControl";
import { EvalRunHistory } from "@/components/agent-evals/EvalRunHistory";
import { RegressionBanner } from "@/components/agent-evals/RegressionBanner";
import { s } from "./styles";

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const [compareIds, setCompareIds] = React.useState<[string, string] | null>(null);
  return (
    <section aria-labelledby={`evals-title-${agentId}`} data-agent-id={agentId} style={s.wrap}>
      <header style={s.header}>
        <h2 id={`evals-title-${agentId}`} style={s.title}>
          {t("evalsTab.metricsTitle")}
        </h2>
        <p style={s.subtitle}>{t("evalsTab.metricsSubtitle")}</p>
      </header>
      <EvalRunControl agentId={agentId} />
      <EvalCasesList agentId={agentId} />
      <RegressionBanner agentId={agentId} />
      <EvalRunHistory agentId={agentId} onCompare={setCompareIds} />
      {compareIds && <EvalCompare agentId={agentId} runIds={compareIds} onClose={() => setCompareIds(null)} />}
    </section>
  );
}
