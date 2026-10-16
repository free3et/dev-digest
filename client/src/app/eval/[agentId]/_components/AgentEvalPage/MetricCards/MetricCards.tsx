/* MetricCards — Recall / Precision / Citation accuracy of the newest finished
   run, the point delta against the previous one and a sparkline over the
   loaded history (Spec F AC-13..AC-15). Values are derived from the one
   eval-runs response; the cards make no request. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import {
  EVAL_CAPTION_STYLE,
  METRIC_COLOR,
  MetricPercent,
  MetricSparkline,
  PointDelta,
  type MetricField,
} from "@/components/eval-metric";
import { metricCardView } from "./helpers";
import { s } from "./styles";

const CARDS = [
  ["recall", "recall"],
  ["precision", "precision"],
  ["citation_accuracy", "citation"],
] as const satisfies readonly (readonly [MetricField, "recall" | "precision" | "citation"])[];

export function MetricCards({ runs }: { runs: readonly EvalSuiteRun[] }) {
  const t = useTranslations("eval");
  return (
    <div style={s.grid}>
      {CARDS.map(([field, name]) => {
        const view = metricCardView(runs, field);
        const label = t(`agentPage.cards.${name}`);
        return (
          <div key={field} style={s.card}>
            <div style={s.main}>
              <span style={EVAL_CAPTION_STYLE}>{label}</span>
              <div style={s.valueRow}>
                <span style={{ ...s.value, color: METRIC_COLOR[field] }}>
                  <MetricPercent value={view.value} />
                </span>
                {view.value !== null && (
                  <span style={s.delta}>
                    <PointDelta delta={view.delta} />
                  </span>
                )}
              </div>
            </div>
            {view.points.length >= 2 && (
              <span style={s.spark}>
                <MetricSparkline points={view.points} color={METRIC_COLOR[field]} metricLabel={label} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
