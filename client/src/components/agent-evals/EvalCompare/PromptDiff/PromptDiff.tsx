/* PromptDiff — collapsible line diff of two agent versions' system prompts
   (Spec B AC-9). Versions are fetched only when they differ. Lines render as
   plain text in a monospace list, never as Markdown or HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { EVAL_CAPTION_STYLE } from "@/components/eval-metric";
import { MINUS } from "@/lib/format";
import { useAgentVersion } from "@/lib/hooks/agents";
import { lineDiff } from "../helpers";
import { s } from "../styles";

export function PromptDiff({
  agentId,
  versionA,
  versionB,
}: {
  agentId: string;
  versionA: number;
  versionB: number;
}) {
  const t = useTranslations("eval");
  const [open, setOpen] = React.useState(false);
  const differ = versionA !== versionB;
  const a = useAgentVersion(agentId, differ ? versionA : null);
  const b = useAgentVersion(agentId, differ ? versionB : null);
  const id = React.useId();

  let body: React.ReactNode;
  if (!differ) {
    body = <p style={s.muted}>{t("compare.promptDiff.same")}</p>;
  } else if (a.isError || b.isError) {
    body = (
      <p role="alert" style={s.muted}>
        {t("compare.promptDiff.loadError")}
      </p>
    );
  } else if (!a.data || !b.data) {
    body = <p style={s.muted}>{t("compare.promptDiff.loading")}</p>;
  } else if (a.data.config.system_prompt === b.data.config.system_prompt) {
    body = <p style={s.muted}>{t("compare.promptDiff.same")}</p>;
  } else {
    const lines = lineDiff(a.data.config.system_prompt, b.data.config.system_prompt);
    body = (
      <>
        <div>
          <Button
            kind="secondary"
            size="sm"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? t("compare.promptDiff.hide") : t("compare.promptDiff.show")}
          </Button>
        </div>
        {open && (
          <div style={s.legend}>
            <span style={s.legendItem}>
              <span style={{ ...s.diffMarker, ...s.diffRemoved }} aria-hidden="true">
                {MINUS}
              </span>
              <span>{t("compare.legend.old", { version: versionA })}</span>
            </span>
            <span style={s.legendItem}>
              <span style={{ ...s.diffMarker, ...s.diffAdded }} aria-hidden="true">
                +
              </span>
              <span>{t("compare.legend.new", { version: versionB })}</span>
            </span>
          </div>
        )}
        {open && (
          <ul id={id} className="mono" style={s.diffBox}>
            {lines.map((l, i) => (
              <li
                key={i}
                style={{
                  ...s.diffLine,
                  ...(l.kind === "added" ? s.diffAdded : l.kind === "removed" ? s.diffRemoved : null),
                }}
              >
                <span
                  style={s.diffMarker}
                  title={
                    l.kind === "added"
                      ? t("compare.promptDiff.added")
                      : l.kind === "removed"
                        ? t("compare.promptDiff.removed")
                        : undefined
                  }
                >
                  {l.kind === "added" ? "+" : l.kind === "removed" ? MINUS : " "}
                </span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section style={s.wrap} aria-label={t("compare.promptDiff.title")}>
      <h4 style={{ ...s.subheading, ...EVAL_CAPTION_STYLE }}>{t("compare.promptDiff.title")}</h4>
      {body}
    </section>
  );
}
