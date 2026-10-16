/* MetricTrend — three-series line chart over the agent's finished runs, oldest
   to newest (Spec F AC-16..AC-20). Recharts is imported here only, and never
   through `@devdigest/ui`, so no other route needs it. The vendored LineChart
   is not used: it draws null as 0. Null leaves a gap (`connectNulls={false}`);
   a metric null everywhere draws no line and its legend entry says "(no data)".
   Text alternative: a `role="img"` summary around the hidden chart plus a
   visually hidden table as its sibling (a table inside `role="img"` would be
   flattened). No animation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EvalSuiteRun } from "@devdigest/shared";
import { EVAL_CAPTION_STYLE, METRIC_COLOR, RanAt, type MetricField } from "@/components/eval-metric";
import { EMPTY } from "@/lib/format";
import { VISUALLY_HIDDEN } from "@/lib/visually-hidden";
import { seriesHasData, TREND_KEYS, trendRows, type TrendKey } from "./helpers";
import { CHART_HEIGHT, LINE_WIDTH, s } from "./styles";
import { TrendTooltip } from "./TrendTooltip";

const FIELD: Record<TrendKey, MetricField> = {
  recall: "recall",
  precision: "precision",
  citation: "citation_accuracy",
};
const Y_TICKS = [0, 25, 50, 75, 100];
const TICK = { fill: "var(--text-secondary)", fontSize: 11 } as const;

export function MetricTrend({ runs }: { runs: readonly EvalSuiteRun[] }) {
  const t = useTranslations("eval");
  const rows = React.useMemo(() => trendRows(runs), [runs]);
  const headingId = React.useId();

  const legend = (
    <ul role="list" style={s.legend}>
      {TREND_KEYS.map((key) => {
        const name = t(`agentPage.trend.legend.${key}`);
        return (
          <li key={key} style={s.legendItem}>
            <span aria-hidden="true" style={{ ...s.swatch, background: METRIC_COLOR[FIELD[key]] }} />
            {seriesHasData(rows, key) ? name : t("agentPage.trend.noData", { metric: name })}
          </li>
        );
      })}
    </ul>
  );

  let body: React.ReactNode;
  if (rows.length === 0) {
    body = <p style={s.muted}>{t("agentPage.trend.empty")}</p>;
  } else if (rows.length === 1) {
    body = <p style={s.muted}>{t("agentPage.trend.oneRun")}</p>;
  } else {
    body = (
      <>
        <div role="img" aria-label={t("agentPage.trend.summary", { count: rows.length })}>
          <div aria-hidden="true" style={s.chart}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={rows} accessibilityLayer={false} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="idx"
                  tick={TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tickFormatter={(i: number) => rows[i]?.label ?? ""}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={Y_TICKS}
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => t("metricFormat.percent", { value: v })}
                />
                <Tooltip content={<TrendTooltip />} isAnimationActive={false} />
                {TREND_KEYS.filter((key) => seriesHasData(rows, key)).map((key) => (
                  <Line
                    key={key}
                    type="linear"
                    dataKey={key}
                    stroke={METRIC_COLOR[FIELD[key]]}
                    strokeWidth={LINE_WIDTH}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <table style={VISUALLY_HIDDEN}>
          <caption>{t("agentPage.trend.tableCaption")}</caption>
          <thead>
            <tr>
              {(["version", "ranAt", "recall", "precision", "citation"] as const).map((c) => (
                <th key={c} scope="col">
                  {t(`agentPage.trend.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.idx}>
                <td>{r.label}</td>
                <td>
                  <RanAt iso={r.ran_at} />
                </td>
                {TREND_KEYS.map((key) => (
                  <td key={key}>
                    {r[key] === null ? EMPTY : t("metricFormat.percent", { value: r[key] })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <section style={s.card} aria-labelledby={headingId}>
      <div style={s.header}>
        <h2 id={headingId} style={{ ...s.title, ...EVAL_CAPTION_STYLE }}>
          {t("agentPage.trend.title")}
        </h2>
        {rows.length >= 2 && legend}
      </div>
      {body}
    </section>
  );
}
