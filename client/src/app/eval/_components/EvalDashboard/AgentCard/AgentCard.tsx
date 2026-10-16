/* AgentCard — one agent of the Eval Dashboard as a row-card (Spec E AC-3..AC-9).
   Pills and metric captions are text; colour only reinforces. One tab stop: the
   chevron link, to the agent's eval page (Spec F AC-23). The recall sparkline is
   plain SVG, not focusable, and exists only with at least two points (AC-27). No model chip (NG-1). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalDashboardRow } from "@devdigest/shared";
import {
  EVAL_CAPTION_STYLE,
  METRIC_COLOR,
  MetricPercent,
  MetricSparkline,
  PointDelta,
  RanAt,
  type MetricField,
} from "@/components/eval-metric";
import { EMPTY, pointDelta } from "@/lib/format";
import { VISUALLY_HIDDEN } from "@/lib/visually-hidden";
import { StatePill } from "../StatePill";
import { s } from "./styles";

const METRICS = [
  ["recall", "recall"],
  ["precision", "precision"],
  ["citation_accuracy", "citation"],
] as const satisfies readonly (readonly [MetricField, "recall" | "precision" | "citation"])[];

function MetricBlock({ row, field, name }: { row: EvalDashboardRow; field: MetricField; name: "recall" | "precision" | "citation" }) {
  const t = useTranslations("eval");
  const value = row.latest ? row.latest[field] : null;
  const full = t(`dashboard.card.metricName.${name}`);
  return (
    <div style={s.metric}>
      <span title={full} style={EVAL_CAPTION_STYLE}>
        <span aria-hidden="true">{t(`dashboard.card.metric.${name}`)}</span>
        <span style={VISUALLY_HIDDEN}>{full}</span>
      </span>
      <span style={{ ...s.value, color: METRIC_COLOR[field] }}>
        {value == null ? EMPTY : <MetricPercent value={value} />}
      </span>
      {value != null && (
        <span style={s.delta}>
          <PointDelta delta={pointDelta(row.delta[field])} />
        </span>
      )}
    </div>
  );
}

export function AgentCard({ row, recallPoints }: { row: EvalDashboardRow; recallPoints?: number[] }) {
  const t = useTranslations("eval");
  const latest = row.latest;
  return (
    <li style={s.card}>
      <div style={s.left}>
        <div style={s.line1}>
          <span style={s.tile} aria-hidden="true">
            <Icon.FlaskConical size={16} aria-hidden="true" />
          </span>
          <span style={s.name} title={row.agent_name}>
            {row.agent_name}
          </span>
          {row.drop && <StatePill tone="crit" label={t("dashboard.card.pill.drop")} title={t("dashboard.card.pillTitle.drop")} />}
          {row.running && (
            <StatePill tone="accent" label={t("dashboard.card.pill.running")} title={t("dashboard.card.pillTitle.running")} />
          )}
          {latest?.status === "partial" && (
            <StatePill tone="warn" label={t("dashboard.card.pill.partial")} title={t("dashboard.card.pillTitle.partial")} />
          )}
        </div>
        <div style={s.line2}>
          {latest
            ? t.rich("dashboard.card.lastRun", {
                version: latest.agent_version,
                passed: latest.cases_passed,
                total: latest.cases_total,
                time: () => <RanAt iso={latest.ran_at} />,
              })
            : t("dashboard.card.neverRun", { count: row.cases_total })}
        </div>
      </div>
      {recallPoints && recallPoints.length >= 2 && (
        <span style={s.spark}>
          <MetricSparkline
            points={recallPoints}
            color={METRIC_COLOR.recall}
            metricLabel={t("dashboard.card.metricName.recall")}
          />
        </span>
      )}
      <div style={s.metrics}>
        {METRICS.map(([field, name]) => (
          <MetricBlock key={field} row={row} field={field} name={name} />
        ))}
      </div>
      <Link
        href={`/eval/${row.agent_id}`}
        style={s.chevron}
        aria-label={t("dashboard.openEvalPageFor", { name: row.agent_name })}
      >
        <Icon.ChevronRight size={18} aria-hidden="true" />
      </Link>
    </li>
  );
}
