/* CopyCaseDialog — "Copy from agent case" (Spec G2 AC-4). The button opens a
   dialog that lists the cases of every agent of the workspace, grouped under the
   agent's name; picking one sends `POST /skills/:id/eval-cases/copy`. The dialog
   is mounted only while open, so agent cases are fetched only then (NFR-3).
   Case and agent names are untrusted text, rendered as React text. */
"use client";

import React, { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useDialogA11y } from "@/lib/hooks/dialog-a11y";
import { useAgentCasesForCopy, useCopyEvalCaseToSkill, type EvalHost } from "@/lib/hooks/eval";
import { skillRefusalKey } from "@/components/agent-evals/helpers";
import { s } from "./styles";

export function CopyCaseDialog({ skillId, agents }: { skillId: string; agents: readonly EvalHost[] | undefined }) {
  const t = useTranslations("eval");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button kind="secondary" size="sm" icon="Copy" onClick={() => setOpen(true)}>
        {t("skillEvals.copy.open")}
      </Button>
      {open && <CopyCasePicker skillId={skillId} agents={agents ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}

function CopyCasePicker({
  skillId,
  agents,
  onClose,
}: {
  skillId: string;
  agents: readonly EvalHost[];
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const results = useAgentCasesForCopy(
    agents.map((a) => a.id),
    true,
  );
  const copy = useCopyEvalCaseToSkill(skillId);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLElement | null>(null);
  const uid = useId();
  const titleId = `${uid}-title`;

  const loading = results.some((r) => r.isLoading);
  const failed = results.length > 0 && results.every((r) => r.isError);
  useDialogA11y({ containerRef, labelId: titleId, initialFocusRef: closeRef, ready: true, onClose });

  const groups = agents
    .map((agent, i) => ({ agent, cases: results[i]?.data ?? [] }))
    .filter((g) => g.cases.length > 0);

  let body: React.ReactNode;
  if (loading) {
    body = <p style={s.muted}>{t("skillEvals.copy.loading")}</p>;
  } else if (failed) {
    body = (
      <p role="alert" style={s.error}>
        {t("skillEvals.copy.loadError")}
      </p>
    );
  } else if (groups.length === 0) {
    body = <p style={s.muted}>{t("skillEvals.copy.empty")}</p>;
  } else {
    body = (
      <div style={s.groups}>
        {groups.map(({ agent, cases }) => (
          <section key={agent.id} aria-labelledby={`${uid}-${agent.id}`} style={s.group}>
            <h4 id={`${uid}-${agent.id}`} style={s.agentName} title={agent.name}>
              {agent.name}
            </h4>
            <ul style={s.list}>
              {cases.map((c) => (
                <li key={c.id}>
                  <Button
                    kind="ghost"
                    size="sm"
                    aria-label={t("skillEvals.copy.caseName", { name: c.name })}
                    disabled={copy.isPending}
                    onClick={() => copy.mutate(c.id, { onSuccess: onClose })}
                  >
                    <span style={s.caseName} title={c.name}>
                      {c.name}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return createPortal(
    <div ref={containerRef}>
      <Modal
        width={560}
        title={<span id={titleId}>{t("skillEvals.copy.title")}</span>}
        subtitle={<span style={s.muted}>{t("skillEvals.copy.subtitle")}</span>}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            {/* `Button` does not forward `ref`: the callback ref reaches the button inside. */}
            <span ref={(el) => void (closeRef.current = el?.querySelector("button") ?? null)}>
              <Button kind="secondary" onClick={onClose}>
                {t("skillEvals.copy.close")}
              </Button>
            </span>
          </div>
        }
      >
        <div style={s.body}>
          {body}
          {copy.isError && (
            <p role="alert" style={s.error}>
              {t(`skillEvals.refusals.${skillRefusalKey(copy.error)}`)}
            </p>
          )}
        </div>
      </Modal>
    </div>,
    document.body,
  );
}
