/* CompareTiles — Recall / Precision / Citation / Cost as "A → B" with the
   delta B − A (Spec D AC-6, AC-7). Percents come from the stored metrics, the
   delta from `pointDelta(metricDelta(a, b))`, never from the rounded percents
   (EC-19). Direction is text (glyph + accessible name), never colour alone. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { MetricPercent, PointDelta } from "@/components/eval-metric";
import { EMPTY, formatCostUsd, metricDelta, pointDelta } from "@/lib/format";
import { costDelta } from "../helpers";
import { s } from "./styles";

const METRICS = [
  ["recall", "recall"],
  ["precision", "precision"],
  ["citation", "citation_accuracy"],
] as const;

function CostDelta({ a, b }: { a: number | null; b: number | null }) {
  const t = useTranslations("eval.metricFormat");
  const d = costDelta(a, b);
  if (!d) return <span>{EMPTY}</span>;
  if (d.direction === "flat") return <span style={s.flat}>{d.text}</span>;
  const up = d.direction === "up";
  return (
    <span style={up ? s.up : s.down}>{t(up ? "costUp" : "costDown", { cost: d.cost })}</span>
  );
}

export function CompareTiles({ a, b }: { a: EvalSuiteRun; b: EvalSuiteRun }) {
  const t = useTranslations("eval");
  return (
    <div role="group" aria-label={t("compare.tiles.label")} style={s.grid}>
      {METRICS.map(([labelKey, field]) => (
        <div key={field} style={s.tile}>
          <span style={s.label}>{t(`compare.tiles.${labelKey}`)}</span>
          <span style={s.values}>
            {t.rich("compare.tiles.values", {
              a: () => <MetricPercent value={a[field]} />,
              b: () => <MetricPercent value={b[field]} />,
            })}
          </span>
          <span style={s.delta}>
            <PointDelta delta={pointDelta(metricDelta(a[field], b[field]))} />
          </span>
        </div>
      ))}
      <div style={s.tile}>
        <span style={s.label}>{t("compare.tiles.cost")}</span>
        <span style={s.values}>
          {t.rich("compare.tiles.values", {
            a: () => formatCostUsd(a.cost_usd),
            b: () => formatCostUsd(b.cost_usd),
          })}
        </span>
        <span style={s.delta}>
          <CostDelta a={a.cost_usd} b={b.cost_usd} />
        </span>
      </div>
    </div>
  );
}
