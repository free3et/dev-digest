"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BriefReviewFocus } from "@devdigest/shared";
import { s } from "./styles";

interface FocusListProps {
  items: BriefReviewFocus[];
  onOpenFile?: (path: string, line: number | null) => void;
}

/** Where to look first: each item is a real <button> that opens the file in the diff. */
export function FocusList({ items, onOpenFile }: FocusListProps) {
  const t = useTranslations("brief.card");
  return (
    <>
      {items.map((it) => {
        const where = it.line != null ? `${it.file}:${it.line}` : it.file;
        return (
          <li key={`${it.file}:${it.line}:${it.reason}`} style={{ listStyle: "none" }}>
            <button
              type="button"
              style={s.button}
              aria-label={t("openFile", { file: where })}
              onClick={() => onOpenFile?.(it.file, it.line)}
            >
              <span className="mono" style={s.where} title={where}>
                {where}
              </span>
              <span style={s.reason}>{it.reason}</span>
            </button>
          </li>
        );
      })}
    </>
  );
}
