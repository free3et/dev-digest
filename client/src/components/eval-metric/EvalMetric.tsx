/* Shared rendering of an eval metric and of a delta between two metrics
   (Spec D G-5): one wording on every eval screen. Values arrive as stored
   0..1 numbers and point deltas from `pointDelta` in `@/lib/format`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EMPTY, formatRanAt, formatRanAtLocal, toPercent, type PointDelta as PointDeltaValue } from "@/lib/format";
import { s } from "./styles";

/** "78%" for a 0..1 metric, "—" for null. */
export function MetricPercent({ value }: { value: number | null | undefined }) {
  const t = useTranslations("eval.metricFormat");
  const pct = toPercent(value);
  return <span>{pct === null ? EMPTY : t("percent", { value: pct })}</span>;
}

/**
 * "▲ 4 pt" / "▼ 10 pt" / "0 pt" / "—". The direction is text twice: the glyph
 * and the accessible name ("up 4 pt"), because a screen reader may not
 * announce the glyph as a direction.
 */
export function PointDelta({ delta }: { delta: PointDeltaValue | null }) {
  const t = useTranslations("eval.metricFormat");
  if (!delta) return <span>{EMPTY}</span>;
  if (delta.direction === "flat") {
    return (
      <span role="img" aria-label={t("flatName")} style={s.flat}>
        {t("pointFlat")}
      </span>
    );
  }
  const points = delta.belowOne ? t("lessThanOne") : delta.points;
  const up = delta.direction === "up";
  return (
    <span
      role="img"
      aria-label={t(up ? "upName" : "downName", { points })}
      style={up ? s.up : s.down}
    >
      {t(up ? "pointUp" : "pointDown", { points })}
    </span>
  );
}

/**
 * A suite-run timestamp in local time with the exact UTC instant as tooltip.
 * Unparsable input: shown as is, no `dateTime`. Render client-side only.
 */
export function RanAt({ iso }: { iso: string }) {
  const valid = !Number.isNaN(new Date(iso).getTime());
  return (
    <time dateTime={valid ? iso : undefined} title={formatRanAt(iso)}>
      {formatRanAtLocal(iso)}
    </time>
  );
}
