/* EvalRunHistory — the agent's suite runs, newest first (Spec B AC-4), with
   selection of exactly two finished runs for compare (AC-5). Read-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState } from "@devdigest/ui";
import { EVAL_CAPTION_STYLE, MetricPercent, RanAt } from "@/components/eval-metric";
import { EMPTY, formatCostUsd, formatRanAtLocal } from "@/lib/format";
import { useAgentEvalRuns } from "@/lib/hooks/eval";
import { VISUALLY_HIDDEN } from "@/lib/visually-hidden";
import { effectiveSelection, isSelectable, toggleId } from "./helpers";
import { s } from "./styles";

const COLUMNS = ["select", "ranAt", "version", "status", "recall", "precision", "citation", "pass", "cost"] as const;

export function EvalRunHistory({
  agentId,
  onCompare,
}: {
  agentId: string;
  onCompare: (runIds: [string, string]) => void;
}) {
  const t = useTranslations("eval");
  const runs = useAgentEvalRuns(agentId);
  const [selected, setSelected] = React.useState<string[]>([]);
  // Computed before the body branches: the heading shows the effective selection (AC-16).
  const chosen = runs.data ? effectiveSelection(selected, runs.data) : [];
  const ready = chosen.length === 2;
  const hasRuns = !!runs.data && runs.data.length > 0;

  let body: React.ReactNode;
  if (runs.isLoading) {
    body = <p style={s.muted}>{t("history.loading")}</p>;
  } else if (runs.isError) {
    body = (
      <ErrorState
        title={t("history.loadErrorTitle")}
        body={t("history.loadErrorBody")}
        onRetry={() => runs.refetch()}
      />
    );
  } else if (!runs.data || runs.data.length === 0) {
    body = <p style={s.muted}>{t("history.empty")}</p>;
  } else {
    body = (
      <>
        <table style={s.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" style={{ ...s.th, ...EVAL_CAPTION_STYLE }}>
                  {c === "select" ? (
                    <span style={VISUALLY_HIDDEN}>{t("history.columns.select")}</span>
                  ) : (
                    t(`history.columns.${c}`)
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.data.map((r) => {
              const ranAt = formatRanAtLocal(r.ran_at);
              const selectable = isSelectable(r);
              return (
                <tr key={r.id}>
                  <td style={s.td}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(r.id)}
                      disabled={!selectable}
                      title={selectable ? undefined : t("history.notSelectable")}
                      aria-label={t("history.selectRun", { ranAt })}
                      onChange={() => setSelected(toggleId(chosen, r.id))}
                    />
                  </td>
                  <td style={s.td}>
                    <RanAt iso={r.ran_at} />
                  </td>
                  <td style={{ ...s.td, ...s.version }}>{t("history.version", { version: r.agent_version })}</td>
                  <td style={s.td}>{t(`evalsTab.status.${r.status}`)}</td>
                  <td style={s.td}><MetricPercent value={r.recall} /></td>
                  <td style={s.td}><MetricPercent value={r.precision} /></td>
                  <td style={s.td}><MetricPercent value={r.citation_accuracy} /></td>
                  <td style={s.td}>
                    {r.status === "running" ? EMPTY : t("history.passedOfTotal", { passed: r.cases_passed, total: r.cases_total })}
                  </td>
                  <td style={s.td}>{formatCostUsd(r.cost_usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <section style={s.wrap} aria-label={t("history.title")}>
      <div style={s.header}>
        <div style={s.headerText}>
          <h3 style={s.heading}>
            {chosen.length >= 1 ? t("history.selected", { count: chosen.length }) : t("history.title")}
          </h3>
          {hasRuns && <p style={s.subtitle}>{t("history.subtitle", { count: runs.data!.length })}</p>}
          {hasRuns && !ready && (
            <p id={`eval-compare-hint-${agentId}`} style={s.hint}>
              {t("history.compareHint")}
            </p>
          )}
        </div>
        {hasRuns && (
          <Button
            kind="secondary"
            size="sm"
            disabled={!ready}
            aria-describedby={ready ? undefined : `eval-compare-hint-${agentId}`}
            onClick={() => ready && onCompare([chosen[0]!, chosen[1]!])}
          >
            {t("history.compare")}
          </Button>
        )}
      </div>
      {body}
    </section>
  );
}
