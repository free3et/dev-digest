/* RecentRuns — "Recent eval runs · all agents": the newest finished suite runs
   of the workspace, in the server's order (Spec D AC-17..19). Loads and fails
   independently of the agent table above it (EC-18). Bars are decorative and
   hidden from assistive tech; the percent text carries the value. Agent names
   render as plain text. Read-only. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Icon } from "@devdigest/ui";
import type { EvalRecentRun } from "@devdigest/shared";
import { EVAL_CAPTION_STYLE, METRIC_COLOR, MetricPercent, RanAt } from "@/components/eval-metric";
import { toPercent } from "@/lib/format";
import { useEvalRecentRuns } from "@/lib/hooks/eval";
import { VISUALLY_HIDDEN } from "@/lib/visually-hidden";
import { RECENT_FETCH_LIMIT, RECENT_SHOWN } from "../constants";
import { StatePill } from "../StatePill";
import { s } from "./styles";

const METRIC_COLUMNS = [
  ["recall", "recall"],
  ["precision", "precision"],
  ["citation", "citation_accuracy"],
] as const;
const COLUMNS = ["agent", "ranAt", "version", "recall", "precision", "citation", "pass"] as const;
// Agent column takes the remaining width; the rest are fixed so numbers align.
const COL_WIDTHS = [undefined, 140, 56, 110, 110, 110, 96] as const;

function MetricCell({ value, color }: { value: number | null; color: string }) {
  const pct = toPercent(value);
  return (
    <div style={s.metric}>
      {pct !== null && (
        <span style={s.track} aria-hidden="true">
          <span data-metric-bar style={{ ...s.bar, width: `${pct}%`, background: color }} />
        </span>
      )}
      <span style={s.pct}>
        <MetricPercent value={value} />
      </span>
    </div>
  );
}

export function RecentRuns() {
  const t = useTranslations("eval");
  const runs = useEvalRecentRuns(RECENT_FETCH_LIMIT);
  const headingId = React.useId();

  let body: React.ReactNode;
  if (runs.isLoading) {
    body = <p style={s.muted}>{t("dashboard.recent.loading")}</p>;
  } else if (runs.isError) {
    body = (
      <ErrorState
        title={t("dashboard.recent.loadErrorTitle")}
        body={t("dashboard.recent.loadErrorBody")}
        onRetry={() => runs.refetch()}
      />
    );
  } else if (!runs.data || runs.data.length === 0) {
    body = <p style={s.muted}>{t("dashboard.recent.empty")}</p>;
  } else {
    body = (
      <table style={s.table}>
        <colgroup>
          {COL_WIDTHS.map((w, i) => (
            <col key={COLUMNS[i]} style={w ? { width: w } : undefined} />
          ))}
        </colgroup>
        {/* Visually hidden, kept for assistive tech (AC-11). */}
        <thead>
          <tr style={VISUALLY_HIDDEN}>
            {COLUMNS.map((c) => (
              <th key={c} scope="col">
                {t(`dashboard.recent.columns.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.data.slice(0, RECENT_SHOWN).map((r: EvalRecentRun) => (
            <tr key={r.id}>
              <td style={{ ...s.td, ...s.first }}>
                <Link href={`/eval/${r.agent_id}`} style={s.link} title={r.agent_name}>
                  {r.agent_name}
                </Link>
              </td>
              <td style={{ ...s.td, ...s.mono }}>
                <RanAt iso={r.ran_at} />
              </td>
              <td style={{ ...s.td, ...s.version }}>{t("history.version", { version: r.agent_version })}</td>
              {METRIC_COLUMNS.map(([column, field]) => (
                <td key={column} style={s.td}>
                  <MetricCell value={r[field]} color={METRIC_COLOR[field]} />
                </td>
              ))}
              <td style={{ ...s.td, ...s.last }}>
                <strong>{t("history.passedOfTotal", { passed: r.cases_passed, total: r.cases_total })}</strong>
                {r.status === "partial" && (
                  <span style={s.partial}>
                    <StatePill tone="warn" label={t("dashboard.recent.partial")} title={t("dashboard.card.pillTitle.partial")} />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section style={s.section} aria-labelledby={headingId}>
      <h2 id={headingId} style={{ ...s.h2, ...EVAL_CAPTION_STYLE }}>
        <Icon.Clock size={14} aria-hidden="true" />
        {t("dashboard.recent.title")}
      </h2>
      {body}
    </section>
  );
}
