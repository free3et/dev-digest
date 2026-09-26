"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Modal, Toggle } from "@devdigest/ui";
import type { Agent, ConventionSkillDraft, Skill, SkillType } from "@devdigest/shared";
import { SKILL_TYPES, estimateTokens } from "@/lib/skills";
import { fileNameFor, lineNumbers } from "./helpers";
import { s } from "./styles";

interface Props {
  draft: ConventionSkillDraft;
  agents: readonly Agent[];
  existing: Skill | undefined;
  repoLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (values: {
    name: string;
    description: string;
    body: string;
    type: SkillType;
    enabled: boolean;
    agentId: string | null;
  }) => void;
}

export function CreateSkillModal({ draft, agents, existing, repoLabel, busy, onClose, onSave }: Props) {
  const t = useTranslations("conventions");
  const uid = React.useId();
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [body, setBody] = React.useState(draft.body);
  const [type, setType] = React.useState<SkillType>(existing?.type ?? "convention");
  const [enabled, setEnabled] = React.useState(existing?.enabled ?? true);
  const [agentId, setAgentId] = React.useState("");
  const dirty = name !== draft.name || description !== draft.description || body !== draft.body;
  const lines = lineNumbers(body);
  const ids = { name: `${uid}-name`, desc: `${uid}-desc`, type: `${uid}-type`, body: `${uid}-body`, agent: `${uid}-agent` };

  return (
    <Modal
      title={name.trim() || t("modal.title")}
      onClose={onClose}
      width={760}
      footer={
        <div style={s.footer}>
          <span style={s.footerMeta}>
            {existing ? t("modal.footerExisting", { version: existing.version }) : t("modal.footerNew")}
          </span>
          <Button onClick={onClose}>{t("modal.cancel")}</Button>
          <Button
            kind="primary"
            loading={busy}
            disabled={!name.trim() || !body.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim(),
                body: body.trim(),
                type,
                enabled,
                agentId: agentId || null,
              })
            }
          >
            {t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          {t("modal.banner", { count: draft.convention_ids.length, repo: repoLabel })}
        </div>
        <label style={s.field}>
          <span style={s.label}>{t("modal.name")}</span>
          <input id={ids.name} aria-label={t("modal.name")} value={name} onChange={(e) => setName(e.target.value)} style={s.input} />
        </label>
        <label style={s.field}>
          <span style={s.label}>{t("modal.description")}</span>
          <textarea id={ids.desc} aria-label={t("modal.description")} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={s.textarea} />
        </label>
        <div style={s.row}>
          <div style={s.field}>
            <label htmlFor={ids.type} style={s.label}>{t("modal.type")}</label>
            <div style={s.selectWrap}>
              <select id={ids.type} aria-label={t("modal.type")} className="mono" style={s.select} value={type} onChange={(e) => setType(e.target.value as SkillType)}>
                {SKILL_TYPES.map((v) => (
                  <option key={v} value={v}>{t(`modal.types.${v}`)}</option>
                ))}
              </select>
              <Icon.ChevronsUpDown size={14} style={s.selectIcon} />
            </div>
          </div>
          <div style={s.enabled}>
            <span>{t("modal.enabled")}</span>
            <span role="group" aria-label={t("modal.enabled")}>
              <Toggle on={enabled} onChange={setEnabled} />
            </span>
            <span style={s.hint}>{t("modal.enabledHint")}</span>
          </div>
        </div>
        <div style={s.field}>
          <label htmlFor={ids.body} style={s.label}>{t("modal.body")}</label>
          <div style={s.editor}>
            <div style={s.fileBar}>
              <Icon.FileText size={14} style={s.fileIcon} />
              <span className="mono" style={s.fileName}>{fileNameFor(name)}</span>
              {dirty && <Badge>{t("modal.unsaved")}</Badge>}
              <span className="mono" style={s.tokens}>{t("modal.tokens", { count: estimateTokens(body) })}</span>
            </div>
            <div style={s.code}>
              <div ref={gutterRef} aria-hidden="true" data-testid="line-gutter" className="mono" style={s.gutter}>
                {lines.map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>
              <textarea
                id={ids.body}
                aria-label={t("modal.body")}
                className="mono"
                style={s.bodyArea}
                wrap="off"
                spellCheck={false}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onScroll={(e) => {
                  if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
              />
            </div>
          </div>
        </div>
        <label style={s.field}>
          <span style={s.label}>{t("modal.agent")}</span>
          <select id={ids.agent} aria-label={t("modal.agent")} value={agentId} onChange={(e) => setAgentId(e.target.value)} style={s.select}>
            <option value="">{t("modal.agentNone")}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
