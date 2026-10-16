/* EvalCasesList — the cases of one agent (Spec A AC-7) with a confirmed delete
   (AC-8). Server state only: the list comes from `useAgentEvalCases`, delete
   goes through `useDeleteEvalCase`, which refetches the list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Modal } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { EVAL_CAPTION_STYLE } from "@/components/eval-metric";
import { useAgentEvalCases, useDeleteEvalCase } from "@/lib/hooks/eval";
import { s, kindBadgeStyle } from "./styles";

const REFUSAL_KEYS = ["eval_run_in_progress", "not_found", "network_error"] as const;

/** i18n key under `evalsTab.refusals` for a failed delete. */
function refusalKey(err: unknown): (typeof REFUSAL_KEYS)[number] | "unknown" {
  if (!(err instanceof ApiError)) return "network_error";
  return REFUSAL_KEYS.find((k) => k === err.code) ?? (err.status === 0 ? "network_error" : "unknown");
}

export function EvalCasesList({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const cases = useAgentEvalCases(agentId);
  const del = useDeleteEvalCase(agentId);
  const [pendingDelete, setPendingDelete] = React.useState<EvalCase | null>(null);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
  };

  let body: React.ReactNode;
  if (cases.isLoading) {
    body = <p style={s.muted}>{t("evalsTab.loadingCases")}</p>;
  } else if (cases.isError) {
    body = (
      <ErrorState
        title={t("evalsTab.casesLoadErrorTitle")}
        body={t("evalsTab.casesLoadErrorBody")}
        onRetry={() => cases.refetch()}
      />
    );
  } else if (!cases.data || cases.data.length === 0) {
    body = <p style={s.muted}>{t("evalsTab.emptyCases")}</p>;
  } else {
    body = (
      <ul style={s.list}>
        {cases.data.map((c) => {
          const e = c.expected_output;
          const failed = del.isError && del.variables === c.id;
          const tone = e.kind === "must_find" ? "ok" : "warn";
          const kindName = t(`evalsTab.kind.${e.kind}Name`);
          const location = t("evalsTab.fileLine", { file: e.file, line: e.start_line });
          return (
            <li key={c.id} style={s.row}>
              <div style={s.rowMain}>
                {/* Vendored Badge has no title/aria props: the wrapper carries the name. */}
                <span role="img" aria-label={kindName} title={kindName} style={s.badgeWrap}>
                  <Badge color="var(--text-primary)" bg={`var(--${tone}-bg)`} style={{ ...EVAL_CAPTION_STYLE, ...kindBadgeStyle(tone) }}>
                    {t(`evalsTab.kind.${e.kind}`)}
                  </Badge>
                </span>
                <span style={s.name} title={c.name}>
                  {c.name}
                </span>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Trash"
                  aria-label={t("evalsTab.deleteCase", { name: c.name })}
                  disabled={del.isPending}
                  onClick={() => {
                    del.reset();
                    setPendingDelete(c);
                  }}
                >
                  {t("evalsTab.delete")}
                </Button>
              </div>
              <span className="mono" style={s.location} title={location}>
                {location}
              </span>
              {failed && (
                <p role="alert" style={s.error}>
                  {t(`evalsTab.refusals.${refusalKey(del.error)}`)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section style={s.wrap} aria-label={t("evalsTab.casesHeading")}>
      <h3 style={s.heading}>{t("evalsTab.casesHeading")}</h3>
      {body}
      {pendingDelete && (
        <Modal
          width={420}
          title={t("evalsTab.deleteConfirm.title", { name: pendingDelete.name })}
          onClose={del.isPending ? undefined : () => setPendingDelete(null)}
          footer={
            <div style={s.modalFooter}>
              <Button kind="secondary" onClick={() => setPendingDelete(null)} disabled={del.isPending}>
                {t("evalsTab.deleteConfirm.cancel")}
              </Button>
              <Button kind="danger" onClick={confirmDelete} loading={del.isPending}>
                {t("evalsTab.deleteConfirm.confirm")}
              </Button>
            </div>
          }
        >
          <p style={s.modalBody}>{t("evalsTab.deleteConfirm.body")}</p>
        </Modal>
      )}
    </section>
  );
}
