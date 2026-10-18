/* SkillBodyDiff — the skill's body at the two compared skill versions
   (Spec G2 AC-13), from `GET /skills/:id/versions`. The same version on both
   sides means the same body, so there is nothing to diff (EC-6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSkillVersions } from "@/lib/hooks/skills";
import { LineDiff } from "../LineDiff";

export function SkillBodyDiff({
  skillId,
  versionA,
  versionB,
}: {
  skillId: string;
  versionA: number;
  versionB: number;
}) {
  const t = useTranslations("eval");
  const differ = versionA !== versionB;
  const versions = useSkillVersions(differ ? skillId : null);
  const textA = versions.data?.find((v) => v.version === versionA)?.body;
  const textB = versions.data?.find((v) => v.version === versionB)?.body;
  // A listed history that lacks one of the versions cannot be diffed: say so as a load error.
  const missing = !!versions.data && (textA === undefined || textB === undefined);

  return (
    <LineDiff
      title={t("skillEvals.compare.bodyDiff.title")}
      versionA={versionA}
      versionB={versionB}
      textA={textA}
      textB={textB}
      loading={versions.isLoading}
      error={versions.isError || missing}
      sameText={!differ || (textA !== undefined && textA === textB)}
      labels={{
        same: t("skillEvals.compare.bodyDiff.same"),
        loading: t("skillEvals.compare.bodyDiff.loading"),
        loadError: t("skillEvals.compare.bodyDiff.loadError"),
      }}
    />
  );
}
