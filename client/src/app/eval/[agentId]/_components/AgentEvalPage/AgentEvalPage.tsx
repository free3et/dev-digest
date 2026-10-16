/* AgentEvalPage — body of `/eval/<agentId>` (Spec F). Composition only: the
   state comes from `useAgentEvalPage`, run control / banner / history / compare
   are the shared `agent-evals` parts the Evals tab uses too. Cards, trend and
   subtitle read the one eval-runs response and make no request. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { EvalCompare } from "@/components/agent-evals/EvalCompare";
import { EvalRunHistory } from "@/components/agent-evals/EvalRunHistory";
import { RegressionBanner } from "@/components/agent-evals/RegressionBanner";
import { AgentHeader } from "./AgentHeader";
import { AgentNotFound } from "./AgentNotFound";
import type { useAgentEvalPage } from "./hooks/useAgentEvalPage";
import { MetricCards } from "./MetricCards";
import { MetricTrend } from "./MetricTrend";
import { s } from "./styles";

export type AgentEvalPageView = ReturnType<typeof useAgentEvalPage>;

export function AgentEvalPage({ view }: { view: AgentEvalPageView }) {
  const t = useTranslations("eval");
  const [compareIds, setCompareIds] = React.useState<[string, string] | null>(null);
  const { state, agent, runs, cases, validId } = view;

  if (state === "invalid" || state === "notFound") return <AgentNotFound />;
  if (state === "error") {
    return (
      <div style={s.page}>
        <ErrorState title={t("agentPage.loadErrorTitle")} body={t("agentPage.loadErrorBody")} onRetry={view.retryAgent} />
      </div>
    );
  }
  if (state === "loading" || !agent.data || !validId) {
    return (
      <div style={s.page}>
        <p style={s.muted}>{t("agentPage.loading")}</p>
      </div>
    );
  }

  const history = runs.data ?? [];
  const noCases = cases.data !== undefined && cases.data.length === 0;
  let overview: React.ReactNode;
  if (noCases) {
    overview = (
      <div style={s.noCases}>
        <span>{t("agentPage.noCases.text")}</span>
        <Link href={`/agents/${validId}?tab=evals`}>{t("agentPage.noCases.link")}</Link>
      </div>
    );
  } else if (runs.isLoading) {
    overview = <p style={s.muted}>{t("agentPage.loadingRuns")}</p>;
  } else {
    overview = (
      <>
        <MetricCards runs={history} />
        <MetricTrend runs={history} />
      </>
    );
  }

  return (
    <div style={s.page}>
      <AgentHeader agent={agent.data} runs={runs.data} agentId={validId} />
      <RegressionBanner agentId={validId} />
      {overview}
      <EvalRunHistory agentId={validId} onCompare={setCompareIds} />
      {compareIds && <EvalCompare agentId={validId} runIds={compareIds} onClose={() => setCompareIds(null)} />}
    </div>
  );
}
