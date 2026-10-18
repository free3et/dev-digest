/* TrendTooltip — hover / touch tooltip of one trend point (Spec F AC-19).
   Recharts hands it the hovered row through `payload`. Text only, from
   `tooltipContent`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { RanAt } from "@/components/eval-metric";
import { EMPTY } from "@/lib/format";
import { tooltipContent, type TrendRow } from "../helpers";
import { s } from "../styles";

export interface TrendTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: TrendRow }[];
}

export function TrendTooltip({ active, payload }: TrendTooltipProps) {
  const t = useTranslations("eval");
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const content = tooltipContent(row);
  return (
    <div style={s.tooltip}>
      <span style={s.tooltipHeader}>
        {t.rich("agentPage.trend.tooltipHeader", {
          version: content.version,
          time: () => <RanAt iso={content.ranAt} />,
        })}
      </span>
      {content.metrics.map((m) => (
        <span key={m.key}>
          {t("agentPage.trend.tooltipMetric", {
            metric: t(`agentPage.trend.legend.${m.key}`),
            value: m.percent === null ? EMPTY : t("metricFormat.percent", { value: m.percent }),
          })}
        </span>
      ))}
    </div>
  );
}
