/* EvalCasesList — the cases of one owner, an agent or a skill (Spec A AC-7,
   Spec G2 AC-2) with a confirmed delete (AC-8). Server state only: the list
   comes from `useOwnerEvalCases`, delete goes through `useDeleteEvalCase`,
   which refetches the owner's list. A skill's cases run through a host agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Modal } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { EVAL_CAPTION_STYLE } from "@/components/eval-metric";
import { formatCostUsd } from "@/lib/format";
import { useDeleteEvalCase, useOwnerEvalCases, useRunEvalCase, type EvalHost } from "@/lib/hooks/eval";
import { EvalRunControl } from "../EvalRunControl";
import { resolveOwner, skillRefusalKey, type OwnerProps } from "../helpers";
import { CaseEditorDialog } from "./CaseEditorDialog";
import { useCaseResults } from "./hooks/useCaseResults";
import { assertParts, passingCount, rowView, type AssertParts, type RowStatus, type RowView } from "./helpers";
import { s, kindBadgeStyle, statusColor } from "./styles";

/** Different shapes per status, so the state never rests on colour alone (NFR-1). */
const STATUS_ICON = {
  passed: Icon.CheckCircle,
  failed: Icon.XCircle,
  errored: Icon.AlertTriangle,
  neverRun: Icon.Dot,
} as const satisfies Record<RowStatus, unknown>;

const REFUSAL_KEYS = ["eval_run_in_progress", "not_found", "network_error"] as const;

/** i18n key under `evalsTab.refusals` for a failed delete. */
function refusalKey(err: unknown): (typeof REFUSAL_KEYS)[number] | "unknown" {
  if (!(err instanceof ApiError)) return "network_error";
  return REFUSAL_KEYS.find((k) => k === err.code) ?? (err.status === 0 ? "network_error" : "unknown");
}

export type EvalCasesListProps = OwnerProps & {
  /** Host agent that runs a skill's cases; `null`/absent disables per-case Run for a skill. */
  host?: EvalHost | null;
  /** Id of the element that explains why running is disabled (no host). */
  runHintId?: string;
  /** Extra buttons after "New eval case" (the skill tab's "Copy from agent case"). */
  extraActions?: React.ReactNode;
};

export function EvalCasesList(props: EvalCasesListProps) {
  const { host, runHintId, extraActions } = props;
  const owner = resolveOwner(props);
  const isSkill = owner.kind === "skill";
  const t = useTranslations("eval");
  const cases = useOwnerEvalCases(owner);
  const del = useDeleteEvalCase(owner);
  const noHost = isSkill && !host;
  const results = useCaseResults(owner);
  const passing = results.hasReference && cases.data ? passingCount(cases.data, results.records) : null;
  /** Refusal text: the skill wording for a skill owner, the agent's otherwise. */
  const refusalText = (err: unknown) =>
    isSkill ? t(`skillEvals.refusals.${skillRefusalKey(err)}`) : t(`evalsTab.refusals.${refusalKey(err)}`);
  const run = useRunEvalCase();
  const [pendingDelete, setPendingDelete] = React.useState<EvalCase | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<EvalCase | null>(null);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
  };

  /** Second line of a row and its tooltip (the error text for an errored row). */
  const secondLine = (v: RowView) => {
    const withLocation = (text: string) => t("evalsTab.row.withLocation", { text, file: v.file, line: v.line });
    switch (v.second.kind) {
      case "result": {
        const text = withLocation(t("evalsTab.row.expected", { count: v.second.expected, got: v.second.got }));
        return { text, title: text };
      }
      case "neverRun": {
        const text = withLocation(t("evalsTab.row.neverRun"));
        return { text, title: text };
      }
      case "errored": {
        const text = withLocation(t("evalsTab.row.errored"));
        return { text, title: v.second.error ?? text };
      }
      default: {
        const text = t("evalsTab.fileLine", { file: v.file, line: v.line });
        return { text, title: text };
      }
    }
  };
  /** Right-hand text of a row: "<SEVERITY> · <category>", one part, or "assert empty". */
  const rightText = (p: AssertParts | null): string | null => {
    if (!p) return null;
    if (p.kind === "assertEmpty") return t("evalsTab.row.assertEmpty");
    if (p.severity && p.category) return t("evalsTab.row.severityCategory", { severity: p.severity, category: p.category });
    return p.severity ?? p.category;
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
    body = <p style={s.muted}>{t(isSkill ? "skillEvals.emptyCases" : "evalsTab.emptyCases")}</p>;
  } else {
    body = (
      <ul style={s.list}>
        {cases.data.map((c) => {
          const e = c.expected_output;
          const failed = del.isError && del.variables === c.id;
          const tone = e.kind === "must_find" ? "ok" : "warn";
          const kindName = t(`evalsTab.kind.${e.kind}Name`);
          const view = rowView(c, results.records);
          const second = secondLine(view);
          const right = rightText(assertParts(e));
          const StatusIcon = view.status ? STATUS_ICON[view.status] : null;
          return (
            <li key={c.id} style={s.row}>
              <div style={s.rowMain}>
                {StatusIcon && view.status && (
                  <span role="img" aria-label={t(`evalsTab.row.status.${view.status}`)} style={s.statusIcon}>
                    <StatusIcon size={16} aria-hidden="true" style={{ color: statusColor(view.status) }} />
                  </span>
                )}
                {/* Vendored Badge has no title/aria props: the wrapper carries the name. */}
                <span role="img" aria-label={kindName} title={kindName} style={s.badgeWrap}>
                  <Badge color="var(--text-primary)" bg={`var(--${tone}-bg)`} style={{ ...EVAL_CAPTION_STYLE, ...kindBadgeStyle(tone) }}>
                    {t(`evalsTab.kind.${e.kind}`)}
                  </Badge>
                </span>
                <span style={s.name} title={c.name}>
                  {c.name}
                </span>
                {right && (
                  <span style={s.assert} title={right}>
                    {right}
                  </span>
                )}
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Play"
                  aria-label={t("evalsTab.runCaseName", { name: c.name })}
                  loading={run.isPending && run.variables?.caseId === c.id}
                  disabled={run.isPending || noHost}
                  aria-describedby={noHost ? runHintId : undefined}
                  onClick={() => run.mutate({ caseId: c.id, agentId: isSkill ? host?.id : undefined })}
                />
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Edit"
                  aria-label={t("evalsTab.editCaseName", { name: c.name })}
                  onClick={() => setEditing(c)}
                />
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
                />
              </div>
              <span className="mono" style={s.location} title={second.title}>
                {second.text}
              </span>
              {run.variables?.caseId === c.id && run.data && (
                <p role="status" style={s.runResult}>
                  <strong>
                    {run.data.outcome === "error"
                      ? t("evalsTab.runResult.error", { error: run.data.error ?? "" })
                      : t(`evalsTab.runResult.${run.data.outcome}`)}
                  </strong>
                  {run.data.outcome !== "error" &&
                    ` · ${t("evalsTab.runResult.detail", {
                      kept: run.data.findings_kept ?? 0,
                      cost: formatCostUsd(run.data.cost_usd),
                    })}`}
                </p>
              )}
              {run.variables?.caseId === c.id && run.isError && (
                <p role="alert" style={s.error}>
                  {refusalText(run.error)}
                </p>
              )}
              {failed && (
                <p role="alert" style={s.error}>
                  {refusalText(del.error)}
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
      <EvalRunControl
        owner={owner}
        host={host}
        runHintId={runHintId}
        label="runAll"
        heading={
          <h3 style={s.heading}>
            {passing
              ? t("evalsTab.passingCount", { passed: passing.passed, total: passing.total })
              : t("evalsTab.casesHeading")}
          </h3>
        }
        actions={
          <>
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
              {t("evalsTab.newCase")}
            </Button>
            {extraActions}
          </>
        }
      />
      {body}
      {creating && <CaseEditorDialog owner={owner} host={host} onClose={() => setCreating(false)} />}
      {editing && <CaseEditorDialog owner={owner} host={host} evalCase={editing} onClose={() => setEditing(null)} />}
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
