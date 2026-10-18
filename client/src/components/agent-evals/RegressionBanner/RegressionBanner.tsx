/* RegressionBanner — "Precision dipped 2 pts on v7. Recall and citation both
   up." above the run history when the newest finished run's recall or
   precision dipped against the previous finished run (Spec D AC-13..16).
   Derived from the run list the history already fetched (same query key, so
   no second request); renders nothing while loading, on error or when there
   is no regression. Amber callout with a decorative icon; the
   sentences carry the meaning, never colour alone. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useOwnerEvalRuns } from "@/lib/hooks/eval";
import { resolveOwner, type OwnerProps } from "../helpers";
import { regressionBanner, type BannerMetric } from "./helpers";
import { s } from "./styles";

export function RegressionBanner(props: OwnerProps) {
  const owner = resolveOwner(props);
  const t = useTranslations("eval");
  const runs = useOwnerEvalRuns(owner);
  if (runs.isLoading || runs.isError || !runs.data) return null;
  // A skill's suites are versioned by the skill; fall back to the host's version if absent.
  const banner = regressionBanner(
    runs.data,
    owner.kind === "skill" ? (r) => r.skill_version ?? r.agent_version : undefined,
  );
  if (!banner) return null;

  // The first named metric opens the sentence, so it takes the capitalised form.
  const name = (metric: BannerMetric, first: boolean) =>
    t(first ? `history.regression.metricStart.${metric}` : `history.regression.metric.${metric}`);

  const dipClauses = banner.dips.map((d, i) =>
    d.belowOne
      ? t("history.regression.dippedBelowOne", { metric: name(d.metric, i === 0) })
      : t("history.regression.dipped", { metric: name(d.metric, i === 0), points: d.points }),
  );
  const [c1 = "", c2 = "", c3 = ""] = dipClauses;
  const list = dipClauses.length === 1 ? c1 : dipClauses.length === 2 ? t("history.regression.list2", { a: c1, b: c2 }) : t("history.regression.list3", { a: c1, b: c2, c: c3 });

  const sentences = [t("history.regression.dipSentence", { list, version: banner.version })];
  if (banner.ups.length === 1) {
    sentences.push(t("history.regression.up1", { a: name(banner.ups[0]!, true) }));
  } else if (banner.ups.length >= 2) {
    sentences.push(t("history.regression.up2", { a: name(banner.ups[0]!, true), b: name(banner.ups[1]!, false) }));
  }
  if (banner.differentCaseSets) sentences.push(t("history.regression.caseSets"));

  return (
    <p role="note" aria-label={t("history.regression.label")} style={s.banner}>
      <Icon.AlertTriangle size={16} aria-hidden="true" style={s.icon} />
      <span>{sentences.join(" ")}</span>
    </p>
  );
}
