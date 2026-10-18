/* App-side sparkline for an eval metric (Spec F F3). Plain SVG, no Recharts, so
   `/eval` pays nothing for it. The vendored Sparkline has a 1.5 px stroke and
   no accessible name, which is why it is not used. The wrapper carries the
   name; the SVG is hidden from assistive tech and is never a tab stop. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { toPercent } from "@/lib/format";
import { STROKE_WIDTH, s } from "./styles";

const PAD = 2;

export interface MetricSparklineProps {
  /** Stored 0..1 values, oldest first, no nulls. */
  points: number[];
  /** CSS colour, e.g. `var(--accent)`. */
  color: string;
  /** Localized full metric name, used in the accessible name. */
  metricLabel: string;
  width?: number;
  height?: number;
}

export function MetricSparkline({ points, color, metricLabel, width = 72, height = 24 }: MetricSparklineProps) {
  const t = useTranslations("eval.metricFormat");
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  const coords = points.map((v, i) => {
    const x = PAD + (innerW * i) / (points.length - 1);
    // A flat series sits at mid-height; otherwise the highest value is at the top.
    const y = span === 0 ? height / 2 : PAD + innerH * (1 - (v - min) / span);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const name = t("sparklineName", {
    metric: metricLabel,
    count: points.length,
    from: toPercent(points[0]) ?? 0,
    to: toPercent(points[points.length - 1]) ?? 0,
  });

  return (
    <span role="img" aria-label={name} style={s.wrap}>
      <svg aria-hidden="true" focusable="false" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
