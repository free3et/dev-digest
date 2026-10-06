"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import { splitPath } from "../helpers";
import { s } from "./styles";

/** One button row per document, in the order received. The ellipsis cell's `title` carries the full path. */
export function DocList({
  docs,
  selected,
  onSelect,
}: {
  docs: SpecFile[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  return (
    <ul aria-label={t("list.ariaLabel")} style={s.list}>
      {docs.map((d) => {
        const { name, folder } = splitPath(d.path);
        const active = d.path === selected;
        return (
          <li key={d.path}>
            <button
              type="button"
              title={d.path}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(d.path)}
              style={{ ...s.row, ...(active ? s.rowActive : null) }}
            >
              <span style={{ ...s.ellipsis, ...s.name }}>{name}</span>
              <span style={s.badge}>{t(`list.type.${d.doc_type}`)}</span>
              <span style={{ ...s.ellipsis, ...s.folder }}>{folder || "/"}</span>
              <span style={s.tokens}>{t("list.tokens", { count: d.approx_tokens })}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
