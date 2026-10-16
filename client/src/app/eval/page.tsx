"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { EvalDashboard } from "./_components/EvalDashboard";

/* Route: /eval. Thin entry — rows, states and links live in EvalDashboard. */
export default function EvalPage() {
  const t = useTranslations("eval");
  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <EvalDashboard />
    </AppShell>
  );
}
