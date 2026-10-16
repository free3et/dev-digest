/* AgentNotFound — shown for a non-UUID segment (no request sent) and for a 404
   from the agent or its runs (Spec F AC-2, AC-3). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { s } from "../styles";

export function AgentNotFound() {
  const t = useTranslations("eval");
  return (
    <div style={s.notFound} role="status">
      <h1 style={s.notFoundTitle}>{t("agentPage.notFound.title")}</h1>
      <p style={s.muted}>{t("agentPage.notFound.body")}</p>
      <Link href="/eval">{t("agentPage.backLink")}</Link>
    </div>
  );
}
