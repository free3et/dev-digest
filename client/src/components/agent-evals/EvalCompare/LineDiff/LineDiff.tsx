/* LineDiff — the collapsible line diff shared by the prompt diff (agents) and
   the skill body diff (skills): title, legend and the +/− list. Purely
   presentational; the caller fetches the two texts. Lines render as plain
   text in a monospace list, never as Markdown or HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { EVAL_CAPTION_STYLE } from "@/components/eval-metric";
import { MINUS } from "@/lib/format";
import { lineDiff } from "../helpers";
import { s } from "../styles";

export interface LineDiffProps {
  title: string;
  versionA: number;
  versionB: number;
  textA?: string;
  textB?: string;
  loading: boolean;
  error: boolean;
  /** The two texts are known to be identical (or the versions are the same). */
  sameText: boolean;
  /** Message for the identical case, the loading state and a load error. */
  labels: { same: string; loading: string; loadError: string };
}

export function LineDiff({ title, versionA, versionB, textA, textB, loading, error, sameText, labels }: LineDiffProps) {
  const t = useTranslations("eval");
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  let body: React.ReactNode;
  if (sameText) {
    body = <p style={s.muted}>{labels.same}</p>;
  } else if (error) {
    body = (
      <p role="alert" style={s.muted}>
        {labels.loadError}
      </p>
    );
  } else if (loading || textA === undefined || textB === undefined) {
    body = <p style={s.muted}>{labels.loading}</p>;
  } else {
    const lines = lineDiff(textA, textB);
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
    <section style={s.wrap} aria-label={title}>
      <h4 style={{ ...s.subheading, ...EVAL_CAPTION_STYLE }}>{title}</h4>
      {body}
    </section>
  );
}
