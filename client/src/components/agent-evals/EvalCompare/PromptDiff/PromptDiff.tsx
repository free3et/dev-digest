/* PromptDiff — collapsible line diff of two agent versions' system prompts
   (Spec B AC-9). Versions are fetched only when they differ; the rendering is
   the shared `LineDiff`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAgentVersion } from "@/lib/hooks/agents";
import { LineDiff } from "../LineDiff";

export function PromptDiff({
  agentId,
  versionA,
  versionB,
}: {
  agentId: string;
  versionA: number;
  versionB: number;
}) {
  const t = useTranslations("eval");
  const differ = versionA !== versionB;
  const a = useAgentVersion(agentId, differ ? versionA : null);
  const b = useAgentVersion(agentId, differ ? versionB : null);
  const textA = a.data?.config.system_prompt;
  const textB = b.data?.config.system_prompt;

  return (
    <LineDiff
      title={t("compare.promptDiff.title")}
      versionA={versionA}
      versionB={versionB}
      textA={textA}
      textB={textB}
      loading={!a.data || !b.data}
      error={a.isError || b.isError}
      sameText={!differ || (textA !== undefined && textA === textB)}
      labels={{
        same: t("compare.promptDiff.same"),
        loading: t("compare.promptDiff.loading"),
        loadError: t("compare.promptDiff.loadError"),
      }}
    />
  );
}
