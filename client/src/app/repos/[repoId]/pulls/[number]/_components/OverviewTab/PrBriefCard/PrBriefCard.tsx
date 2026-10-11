"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { usePrBrief, useGeneratePrBrief } from "@/lib/hooks/brief";
import { formatCostUsd } from "@/lib/format";
import { MergeRiskRow } from "./MergeRiskRow";
import { FocusList } from "./FocusList";
import { MISSING_KEY } from "./constants";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string | null;
  /** Opens a file (and optional line) in the Diff tab. Wired by the page. */
  onOpenFile?: (path: string, line: number | null) => void;
}

/** The PR Brief: summary, merge risks, review focus; generated on demand. */
export function PrBriefCard({ prId, onOpenFile }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const tc = useTranslations("brief.card");
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGeneratePrBrief(prId);
  const [confirming, setConfirming] = React.useState(false);

  const busy = generate.isPending;
  const brief = data?.brief ?? null;
  const stale = data?.stale ?? false;

  const run = () => generate.mutate();
  const onRefresh = () => (stale ? run() : setConfirming(true));

  if (isLoading) {
    return (
      <div style={s.card} aria-busy="true" aria-label={tc("generating")}>
        <Skeleton height={16} width={120} />
        <Skeleton height={64} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={s.card}>
        <div style={s.center}>
          <p role="alert" style={s.hint}>{tc("error")}</p>
          <Button size="sm" onClick={() => refetch()}>{tc("retry")}</Button>
        </div>
      </div>
    );
  }

  const failure = generate.isError ? (
    <div role="alert" style={s.error}>
      <span>{tc("error")}</span>
      <Button size="sm" disabled={busy} onClick={run}>{tc("retry")}</Button>
    </div>
  ) : null;

  if (!brief) {
    return (
      <div style={s.card} aria-busy={busy}>
        <div style={s.center}>
          <h3 style={s.title}>{t("unavailable")}</h3>
          <p style={s.hint}>{t("unavailableHint")}</p>
          <Button size="sm" icon="Sparkles" loading={busy} disabled={busy || !prId} onClick={run}>
            {busy ? tc("generating") : tc("generate")}
          </Button>
        </div>
        {failure}
      </div>
    );
  }

  return (
    <div style={s.card} aria-busy={busy}>
      <div style={s.header}>
        <h3 style={s.title}>{tc("summary")}</h3>
        <span style={s.spacer}>
          <Button size="sm" icon="RefreshCw" loading={busy} disabled={busy || !prId} onClick={onRefresh}>
            {busy ? tc("generating") : tc("refresh")}
          </Button>
        </span>
      </div>

      {stale && (
        <div role="status" style={s.notice}>
          <Icon.Clock size={14} aria-hidden />
          {tc("stale")}
        </div>
      )}
      {failure}

      <p style={s.summary}>{brief.summary}</p>

      <BriefSections brief={brief} onOpenFile={onOpenFile} />

      <div style={s.footer}>
        <span className="mono">{tc("footer", { model: brief.model })}</span>
        <span>{tc("cost", { cost: formatCostUsd(brief.cost_usd) })}</span>
      </div>

      {confirming && (
        <Modal
          width={440}
          title={tc("confirm.title")}
          onClose={() => setConfirming(false)}
          footer={
            <div style={s.modalFooter}>
              <Button size="sm" onClick={() => setConfirming(false)}>{tc("confirm.cancel")}</Button>
              <Button
                size="sm"
                kind="primary"
                onClick={() => {
                  setConfirming(false);
                  run();
                }}
              >
                {tc("confirm.yes")}
              </Button>
            </div>
          }
        >
          <p style={{ ...s.modalBody, margin: 0 }}>{tc("confirm.body")}</p>
        </Modal>
      )}
    </div>
  );
}

function BriefSections({ brief, onOpenFile }: { brief: PrBrief; onOpenFile?: PrBriefCardProps["onOpenFile"] }) {
  const t = useTranslations("brief");
  const tc = useTranslations("brief.card");
  const missing = brief.missing_inputs.map((m) => tc(`missing.${MISSING_KEY[m]}`));
  if (brief.intent_stale) missing.push(tc("missing.intentStale"));
  return (
    <>
      <div>
        <h4 style={s.label}>{t("block.risks")}</h4>
        {brief.risks.risks.length > 0 ? (
          <ul style={s.list}>
            {brief.risks.risks.map((r) => (
              <MergeRiskRow key={`${r.kind}:${r.title}`} risk={r} />
            ))}
          </ul>
        ) : (
          <p style={s.hint}>{tc("noRisks")}</p>
        )}
      </div>

      <div>
        <h4 style={s.label}>{tc("focus")}</h4>
        {brief.review_focus.length > 0 ? (
          <ul style={{ ...s.list, padding: 0 }}>
            <FocusList items={brief.review_focus} onOpenFile={onOpenFile} />
          </ul>
        ) : (
          <p style={s.hint}>{tc("noFocus")}</p>
        )}
      </div>

      {missing.length > 0 && <p style={s.hint}>{tc("generatedWithout", { items: missing.join(", ") })}</p>}
    </>
  );
}
