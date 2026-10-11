"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { PrBriefCard } from "./PrBriefCard";
import { IntentCard } from "./IntentCard";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
  /** Opens a file (and optional line) in the Diff tab; wired by the page. */
  onOpenFile?: (path: string, line: number | null) => void;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("brief.prBrief");
  return (
    <>
      <section>
        <SectionLabel icon="Sparkles">{t("title")}</SectionLabel>
        <div style={s.briefCard}>
          <PrBriefCard prId={prId} onOpenFile={onOpenFile} />
        </div>
        <div style={s.briefGrid}>
          <div style={s.slot}>
            <IntentCard prId={prId} />
          </div>
          <div style={s.slot}>
            <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
          </div>
        </div>
      </section>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
