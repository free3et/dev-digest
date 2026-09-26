"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, IconBtn } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, ConventionUpdate } from "@devdigest/shared";
import { CONVENTION_CATEGORIES } from "../../constants";
import { evidenceRangeLabel } from "../../helpers";
import { s } from "./styles";

interface Props {
  candidate: ConventionCandidate;
  evidenceUrl: string;
  busy?: boolean;
  onAccept: () => void;
  onUnaccept: () => void;
  onReject: () => void;
  onEdit: (patch: ConventionUpdate) => void;
}

export function ConventionCard({
  candidate,
  evidenceUrl,
  busy,
  onAccept,
  onUnaccept,
  onReject,
  onEdit,
}: Props) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState(candidate.category);
  const pct = Math.round(candidate.confidence * 100);
  const range = evidenceRangeLabel(candidate.evidence_path, candidate.evidence_line, candidate.evidence_snippet);

  const startEdit = () => {
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(true);
  };

  const copyPath = () => {
    void navigator.clipboard?.writeText(range);
  };

  return (
    <article style={s.card}>
      <div style={s.main}>
        {editing ? (
          <>
            <label style={s.field}>
              <span style={s.label}>{t("card.rule")}</span>
              <textarea aria-label={t("card.rule")} value={rule} onChange={(e) => setRule(e.target.value)} rows={3} style={s.input} />
            </label>
            <label style={s.field}>
              <span style={s.label}>{t("card.category")}</span>
              <select
                aria-label={t("card.category")}
                value={category}
                onChange={(e) => setCategory(e.target.value as ConventionCategory)}
                style={s.input}
              >
                {CONVENTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`category.${c}`)}</option>
                ))}
              </select>
            </label>
            <div style={s.actions}>
              <Button kind="primary" size="sm" disabled={busy || !rule.trim()} onClick={() => { onEdit({ rule: rule.trim(), category }); setEditing(false); }}>
                {t("card.save")}
              </Button>
              <Button size="sm" onClick={() => setEditing(false)}>{t("card.cancel")}</Button>
            </div>
          </>
        ) : (
          <p style={s.rule}>{candidate.rule}</p>
        )}
        <div style={s.evidenceRow}>
          <a href={evidenceUrl} target="_blank" rel="noreferrer" style={s.evidence}>
            <Icon.ExternalLink size={12} />
            {range}
          </a>
          <IconBtn icon="Copy" label={t("card.copyPath")} size={24} onClick={copyPath} />
        </div>
        <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
        <div style={s.confidence} title={`${t("card.confidence")} ${pct}%`}>
          <span>{t("card.confidence")}</span>
          <div style={s.barTrack}>
            <div style={s.barFill(pct)} />
          </div>
          <span style={s.pct}>{pct}%</span>
        </div>
      </div>
      {!editing && (
        <div style={s.side}>
          <Button
            kind={candidate.accepted ? "primary" : "secondary"}
            size="sm"
            loading={busy}
            onClick={candidate.accepted ? onUnaccept : onAccept}
          >
            {t("card.accepted")}
          </Button>
          <Button kind="danger" size="sm" disabled={busy} onClick={onReject}>{t("card.reject")}</Button>
          <Button kind="ghost" size="sm" disabled={busy} onClick={startEdit}>{t("card.edit")}</Button>
        </div>
      )}
    </article>
  );
}
