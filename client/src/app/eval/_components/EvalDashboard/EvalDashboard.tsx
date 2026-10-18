/* EvalDashboard — one row-card per agent that has eval cases, in the server's
   order (regressions first, then by name; Spec B AC-10), then the recent runs of
   all agents (Spec D). Pills are text, never colour alone. The dashboard does
   not poll (EC-6). Both sections load and fail independently. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Icon } from "@devdigest/ui";
import { EVAL_CAPTION_STYLE } from "@/components/eval-metric";
import { useEvalDashboard, useEvalRecentRuns } from "@/lib/hooks/eval";
import { AgentCard } from "./AgentCard";
import { RECENT_FETCH_LIMIT } from "./constants";
import { recallPointsByAgent } from "./helpers";
import { RecentRuns } from "./RecentRuns";
import { s } from "./styles";

export function EvalDashboard() {
  const t = useTranslations("eval");
  const rows = useEvalDashboard();
  // Same key as `RecentRuns`: one request serves the sparklines and the recent section (Spec F AC-25).
  const recent = useEvalRecentRuns(RECENT_FETCH_LIMIT);
  const recallPoints = React.useMemo(
    () => (recent.data ? recallPointsByAgent(recent.data) : undefined),
    [recent.data],
  );
  const headingId = React.useId();

  let body: React.ReactNode;
  if (rows.isLoading) {
    body = <p style={s.muted}>{t("dashboard.loading")}</p>;
  } else if (rows.isError) {
    body = (
      <ErrorState
        title={t("dashboard.loadErrorTitle")}
        body={t("dashboard.loadErrorBody")}
        onRetry={() => rows.refetch()}
      />
    );
  } else if (!rows.data || rows.data.length === 0) {
    body = (
      <p style={s.muted}>
        {t("dashboard.emptyAgents")} <Link href="/agents">{t("dashboard.emptyLink")}</Link>
      </p>
    );
  } else {
    // Explicit role: `list-style: none` drops list semantics in Safari.
    body = (
      <ul role="list" aria-labelledby={headingId} style={s.list}>
        {rows.data.map((r) => (
          <AgentCard key={r.agent_id} row={r} recallPoints={recallPoints?.get(r.agent_id)} />
        ))}
      </ul>
    );
  }

  return (
    <div style={s.page}>
      <div>
        <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
        <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
      </div>
      <section style={s.section} aria-labelledby={headingId}>
        <h2 id={headingId} style={{ ...s.h2, ...EVAL_CAPTION_STYLE }}>
          <Icon.Gauge size={14} aria-hidden="true" />
          {t("dashboard.agents.title")}
        </h2>
        {body}
      </section>
      <RecentRuns />
    </div>
  );
}
