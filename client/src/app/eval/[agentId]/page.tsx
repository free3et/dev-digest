"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { AgentEvalPage, useAgentEvalPage } from "./_components/AgentEvalPage";

/* Route: /eval/<agentId>. Thin entry: the UUID gate, states and parts live in
   AgentEvalPage. The last crumb is the agent's name once it has loaded. */
export default function AgentEvalRoute() {
  const t = useTranslations("eval");
  const params = useParams<{ agentId?: string }>();
  const view = useAgentEvalPage(String(params?.agentId ?? ""));
  const name = view.state === "ready" ? view.agent.data?.name : undefined;
  return (
    <AppShell
      crumb={[
        { label: t("page.crumbSkillsLab") },
        { label: t("page.crumbEvalDashboard"), href: "/eval" },
        { label: name ?? t("agentPage.crumbAgent") },
      ]}
    >
      <AgentEvalPage view={view} />
    </AppShell>
  );
}
