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
import { useEvalRun, type EvalHost } from "@/lib/hooks/eval";
import { EMPTY } from "@/lib/format";
import { hostLabel, resolveOwner, runVersion, sameCaseSet, type OwnerProps } from "../helpers";
import { buildCaseRows, caseSetSubtitle, orderRuns } from "./helpers";
import { CompareRunInfo } from "./CompareRunInfo";
import { CompareTiles } from "./CompareTiles";
import { CompareCasesTable } from "./CompareCasesTable";
import { PromptDiff } from "./PromptDiff";
import { SkillBodyDiff } from "./SkillBodyDiff";
import { s } from "./styles";

export function EvalCompare(
  props: OwnerProps & {
    runIds: [string, string];
    onClose: () => void;
    /** Agents by id, for the skill owner's host note; undefined while loading. */
    hosts?: ReadonlyMap<string, EvalHost>;
  },
) {
  const { runIds, onClose, hosts } = props;
  const owner = resolveOwner(props);
  const isSkill = owner.kind === "skill";
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
    const hostName = (r: typeof a) => {
      const l = hostLabel(hosts, r.agent_id, r.agent_version);
      return l.kind === "known" ? l.name : l.kind === "deleted" ? t("skillEvals.history.deletedAgent") : EMPTY;
    };
    const hostChanged = isSkill && (a.agent_id !== b.agent_id || a.agent_version !== b.agent_version);
    body = (
      <>
        {!sameCaseSet(a.case_ids, b.case_ids) && (
          <p role="status" style={s.notice}>
            {t("compare.differentCaseSets")}
          </p>
        )}
        <CompareTiles a={a} b={b} />
        <CompareRunInfo a={a} b={b} kind={owner.kind} hosts={hosts} />
        {isSkill ? (
          <>
            {hostChanged && (
              <p role="note" style={s.notice}>
                {t("skillEvals.compare.hostChanged", {
                  a: hostName(a),
                  va: a.agent_version,
                  b: hostName(b),
                  vb: b.agent_version,
                })}
              </p>
            )}
            <SkillBodyDiff skillId={owner.id} versionA={runVersion(a, "skill")} versionB={runVersion(b, "skill")} />
          </>
        ) : (
          <PromptDiff agentId={owner.id} versionA={a.agent_version} versionB={b.agent_version} />
        )}
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
      ? t(isSkill ? "skillEvals.compare.subtitleCaseSet" : "compare.subtitleCaseSet", { count: setInfo.count })
      : t(isSkill ? "skillEvals.compare.subtitleDifferentSets" : "compare.subtitleDifferentSets")
    : null;

  const title = loaded
    ? t("compare.titleWithVersions", { a: runVersion(loaded[0], owner.kind), b: runVersion(loaded[1], owner.kind) })
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
