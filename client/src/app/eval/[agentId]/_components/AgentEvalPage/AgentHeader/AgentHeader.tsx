/* AgentHeader — back link, title with model chip, truthful subtitle, and the
   controls: switcher, "Run eval", link to the Evals tab (Spec F AC-1, AC-6..AC-11).
   Names, provider and model render as plain text. The title column shrinks with
   an ellipsis; the controls never do (EC-8). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { Agent, EvalSuiteRun } from "@devdigest/shared";
import { EvalRunControl } from "@/components/agent-evals/EvalRunControl";
import { AgentSwitcher } from "./AgentSwitcher";
import { subtitleFor } from "./helpers";
import { s } from "./styles";

export function AgentHeader({
  agent,
  runs,
  agentId,
}: {
  agent: Pick<Agent, "name" | "provider" | "model">;
  /** Undefined while the history loads or failed: the subtitle is then hidden, not guessed. */
  runs: readonly EvalSuiteRun[] | undefined;
  agentId: string;
}) {
  const t = useTranslations("eval");
  let subtitle: string | null = null;
  if (runs) {
    const sub = subtitleFor(runs);
    if (sub.kind === "same") subtitle = t("agentPage.subtitle.sameSet", { count: sub.count, cases: sub.cases });
    else if (sub.kind === "different") subtitle = t("agentPage.subtitle.differentSets", { count: sub.count });
    else subtitle = t("agentPage.subtitle.none");
  }

  return (
    <header style={s.wrap}>
      <Link href="/eval" style={s.back}>
        <Icon.ChevronLeft size={14} aria-hidden="true" />
        {t("agentPage.backLink")}
      </Link>
      <div style={s.row}>
        <div style={s.titleCol}>
          <div style={s.titleRow}>
            <h1 style={s.h1} title={agent.name}>
              {agent.name}
            </h1>
            <span style={s.chip}>
              <Badge color="var(--text-secondary)" mono>
                {`${agent.provider}/${agent.model}`}
              </Badge>
            </span>
          </div>
          {subtitle !== null && <p style={s.subtitle}>{subtitle}</p>}
        </div>
        <div style={s.controls}>
          <AgentSwitcher currentId={agentId} currentName={agent.name} />
          <EvalRunControl agentId={agentId} />
          <Link
            href={`/agents/${agentId}?tab=evals`}
            style={s.evalsLink}
            aria-label={t("agentPage.openEvalsTabFor", { name: agent.name })}
          >
            {t("agentPage.openEvalsTab")}
          </Link>
        </div>
      </div>
    </header>
  );
}
