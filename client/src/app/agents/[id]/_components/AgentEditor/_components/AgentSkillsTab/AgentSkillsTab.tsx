/* Skills tab of the agent editor: every system skill with a toggle to attach,
   type label, and reorder for linked skills (order = prompt block order). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import {
  getErrorMessage,
  useAgentSkills,
  useLinkAgentSkill,
  useSetAgentSkills,
  useSkills,
  useUnlinkAgentSkill,
  useUpdateAgentSkillLink,
} from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR, filterSkills } from "@/lib/skills";
import { useToast } from "@/lib/toast";
import { allSkillRows, enabledTokens, moveById, moveToTarget } from "./helpers";
import { s } from "./styles";

export function AgentSkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const toast = useToast();
  const links = useAgentSkills(agentId);
  const skills = useSkills();
  const setSkills = useSetAgentSkills(agentId);
  const linkSkill = useLinkAgentSkill();
  const updateLink = useUpdateAgentSkillLink(agentId);
  const unlink = useUnlinkAgentSkill(agentId);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (links.isError || skills.isError) {
    return <ErrorState body={t("skillsTab.loadError")} onRetry={() => { links.refetch(); skills.refetch(); }} />;
  }
  if (links.isLoading || skills.isLoading) return <Skeleton height={120} />;

  const rows = allSkillRows(links.data ?? [], skills.data ?? []);
  const linkedIds = rows.filter((r) => r.link).map((r) => r.skill.id);
  const visibleIds = new Set(filterSkills(rows.map((r) => r.skill), filter).map((sk) => sk.id));
  const enabledCount = rows.filter((r) => r.link?.enabled).length;
  const tokens = enabledTokens(rows);

  const onError = (err: unknown) => toast.error(getErrorMessage(err, t("skillsTab.updateFailed")));
  const reorder = (next: string[]) => {
    if (next.join() !== linkedIds.join()) setSkills.mutate(next, { onError });
  };

  const onToggle = (skillId: string, checked: boolean, linked: boolean, linkEnabled: boolean) => {
    if (checked) {
      if (!linked) {
        linkSkill.mutate({ agentId, skillId }, { onError });
      } else if (!linkEnabled) {
        updateLink.mutate({ skillId, patch: { enabled: true } }, { onError });
      }
      return;
    }
    if (linked) unlink.mutate(skillId, { onError });
  };

  return (
    <div>
      <div style={s.head}>
        <h2 style={s.title}>{t("skillsTab.title")}</h2>
        <Badge>{t("skillsTab.enabledCount", { enabled: enabledCount, total: rows.length })}</Badge>
        <div style={s.spacer} />
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            aria-label={t("skillsTab.filterPlaceholder")}
            placeholder={t("skillsTab.filterPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skillsTab.orderHint")}</p>
      {tokens > 0 && <div style={s.tokens}>{t("skillsTab.tokens", { count: tokens })}</div>}

      {rows.length === 0 ? (
        <EmptyState icon="Zap" title={t("skillsTab.title")} body={t("skillsTab.empty")} />
      ) : (
        <ul style={s.list}>
          {rows.map(({ link, skill }) => {
            if (!visibleIds.has(skill.id)) return null;
            const linked = !!link;
            const canReorder = !!link?.enabled;
            const linkedIndex = linkedIds.indexOf(skill.id);
            return (
              <li
                key={skill.id}
                draggable={canReorder}
                onDragStart={(e) => {
                  if (!canReorder) return;
                  setDragId(skill.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", skill.id);
                }}
                onDragOver={(e) => {
                  if (!dragId || !link) return;
                  e.preventDefault();
                  setOverId(skill.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && link) reorder(moveToTarget(linkedIds, dragId, skill.id));
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                style={{ ...s.row, ...(overId === skill.id && dragId !== skill.id ? s.rowOver : null) }}
              >
                {canReorder ? (
                  <span aria-hidden style={s.handle} title={t("skillsTab.dragHandle", { name: skill.name })}>
                    ⋮⋮
                  </span>
                ) : (
                  <span aria-hidden style={s.handleMuted} />
                )}
                <input
                  type="checkbox"
                  aria-label={t("skillsTab.enable", { name: skill.name })}
                  checked={!!link?.enabled}
                  onChange={(e) => onToggle(skill.id, e.target.checked, linked, !!link?.enabled)}
                />
                <span className="mono" style={s.name} title={skill.name}>
                  {skill.name}
                </span>
                {!skill.enabled && <Badge color="var(--text-muted)">{t("skillsTab.globallyOff")}</Badge>}
                <Badge color={SKILL_TYPE_COLOR[skill.type]}>{ts(`listItem.type.${skill.type}`)}</Badge>
                {linked && (
                  <>
                    <IconBtn
                      icon="ArrowUp"
                      label={t("skillsTab.moveUp", { name: skill.name })}
                      onClick={
                        !canReorder || linkedIndex <= 0
                          ? undefined
                          : () => reorder(moveById(linkedIds, skill.id, -1))
                      }
                    />
                    <IconBtn
                      icon="ArrowDown"
                      label={t("skillsTab.moveDown", { name: skill.name })}
                      onClick={
                        !canReorder || linkedIndex < 0 || linkedIndex >= linkedIds.length - 1
                          ? undefined
                          : () => reorder(moveById(linkedIds, skill.id, 1))
                      }
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
