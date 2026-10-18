/* SkillDetail — right pane: header (icon, name, type, version, Run on evals) + Config / Preview / Stats / Versions / Context / Evals. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLOR, tintOf } from "@/lib/skills";
import { SKILL_TAB_ICONS, SKILL_TABS, type SkillTab } from "./constants";
import { RunOnEvalsButton } from "./_components/RunOnEvalsButton";
import { SkillEvalsTab } from "./_components/SkillEvalsTab";
import { useSkillEvalHost } from "./hooks/useSkillEvalHost";
import { SkillContextTab } from "./_components/SkillContextTab";
import { SkillConfigTab } from "./_components/SkillConfigTab";
import { SkillPreviewTab } from "./_components/SkillPreviewTab";
import { SkillStatsTab } from "./_components/SkillStatsTab";
import { SkillVersionsTab } from "./_components/SkillVersionsTab";
import { s } from "./styles";

interface Props {
  skill: Skill;
  tab: SkillTab;
  onTabChange: (tab: SkillTab) => void;
  onAskDelete: () => void;
}

export function SkillDetail({ skill, tab, onTabChange, onAskDelete }: Props) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];
  // One host state for the header button and the Evals tab (Spec G2 D4).
  const hostState = useSkillEvalHost(skill.id);
  return (
    <section style={s.root} aria-label={skill.name}>
      <div style={s.head}>
        <span style={s.tile(color, tintOf(color))}>
          <Icon.Sparkles size={16} />
        </span>
        <h2 className="mono" style={s.name} title={skill.name}>
          {skill.name}
        </h2>
        <Badge color={color} bg={tintOf(color)}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge mono icon="GitCommit">
          {t("preview.version", { version: skill.version })}
        </Badge>
        <div style={s.actions}>
          <RunOnEvalsButton skillId={skill.id} host={hostState.host} onStarted={() => onTabChange("evals")} />
        </div>
      </div>
      <Tabs
        pad="8px 28px 0"
        value={tab}
        onChange={(k) => onTabChange(k as SkillTab)}
        tabs={SKILL_TABS.map((key) => ({ key, label: t(`detail.tabs.${key}`), icon: SKILL_TAB_ICONS[key] }))}
      />
      <div style={s.body}>
        {tab === "config" && <SkillConfigTab key={skill.id} skill={skill} onAskDelete={onAskDelete} />}
        {tab === "preview" && <SkillPreviewTab skill={skill} />}
        {tab === "stats" && <SkillStatsTab skillId={skill.id} />}
        {tab === "versions" && <SkillVersionsTab skill={skill} />}
        {tab === "context" && <SkillContextTab key={skill.id} skillId={skill.id} />}
        {tab === "evals" && <SkillEvalsTab skill={skill} hostState={hostState} />}
      </div>
    </section>
  );
}
