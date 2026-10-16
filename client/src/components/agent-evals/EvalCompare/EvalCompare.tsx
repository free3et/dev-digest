/* EvalCompare — two finished runs of one agent in a modal dialog over the
   Evals tab (Spec D AC-4..12; content from Spec B AC-6..9). Reads both runs
   through `useEvalRun`; run A is the older `ran_at`. Shows each run's own
   stored metrics, never recomputed over the case overlap (NG-4).
   Portalled to <body> like EvalCaseModal; the shared `useDialogA11y` adds the
   name, focus, Escape and Tab wrap the vendored Modal lacks. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal } from "@devdigest/ui";
import { useDialogA11y } from "@/lib/hooks/dialog-a11y";
import { useEvalRun } from "@/lib/hooks/eval";
import { sameCaseSet } from "../helpers";
import { buildCaseRows, caseSetSubtitle, orderRuns } from "./helpers";
import { CompareRunInfo } from "./CompareRunInfo";
import { CompareTiles } from "./CompareTiles";
import { CompareCasesTable } from "./CompareCasesTable";
import { PromptDiff } from "./PromptDiff";
import { s } from "./styles";

export function EvalCompare({
  agentId,
  runIds,
  onClose,
}: {
  agentId: string;
  runIds: [string, string];
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const first = useEvalRun(runIds[0]);
  const second = useEvalRun(runIds[1]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLElement | null>(null);
  const titleId = `${React.useId()}-title`;

  const failed = first.isError || second.isError;
  const loaded = !failed && first.data && second.data ? orderRuns(first.data, second.data) : null;

  useDialogA11y({ containerRef, labelId: titleId, initialFocusRef: closeRef, ready: loaded !== null, onClose });

  let body: React.ReactNode;
  if (failed) {
    body = (
      <ErrorState
        title={t("compare.loadErrorTitle")}
        body={t("compare.loadErrorBody")}
        onRetry={() => {
          if (first.isError) first.refetch();
          if (second.isError) second.refetch();
        }}
      />
    );
  } else if (!loaded) {
    body = <p style={s.muted}>{t("compare.loading")}</p>;
  } else {
    const [a, b] = loaded;
    body = (
      <>
        {!sameCaseSet(a.case_ids, b.case_ids) && (
          <p role="status" style={s.notice}>
            {t("compare.differentCaseSets")}
          </p>
        )}
        <CompareTiles a={a} b={b} />
        <CompareRunInfo a={a} b={b} />
        <PromptDiff agentId={agentId} versionA={a.agent_version} versionB={b.agent_version} />
        <section style={s.wrap} aria-label={t("compare.casesHeading")}>
          <h4 style={s.subheading}>{t("compare.casesHeading")}</h4>
          <CompareCasesTable rows={buildCaseRows(a, b)} />
        </section>
      </>
    );
  }

  const setInfo = loaded ? caseSetSubtitle(loaded[0], loaded[1]) : null;
  const subtitle = setInfo
    ? setInfo.same
      ? t("compare.subtitleCaseSet", { count: setInfo.count })
      : t("compare.subtitleDifferentSets")
    : null;

  const title = loaded
    ? t("compare.titleWithVersions", { a: loaded[0].agent_version, b: loaded[1].agent_version })
    : t("compare.title");

  // Portal to <body> (same reason as EvalCaseModal): the Evals tab sits inside
  // stacking contexts that would paint over a position:fixed child.
  return createPortal(
    <div ref={containerRef}>
      <Modal
        width={980}
        title={
          <span id={titleId} style={s.ellipsis} title={title}>
            {title}
          </span>
        }
        subtitle={subtitle ? <span style={s.subtitle}>{subtitle}</span> : undefined}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            {/* `Button` does not forward `ref`: the callback ref reaches the button inside. */}
            <span ref={(el) => void (closeRef.current = el?.querySelector("button") ?? null)}>
              <Button kind="secondary" onClick={onClose}>
                {t("compare.close")}
              </Button>
            </span>
          </div>
        }
      >
        <div style={s.body}>{body}</div>
      </Modal>
    </div>,
    document.body,
  );
}
