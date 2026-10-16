/* CompareCasesTable — per-case outcomes of both runs over the union of their
   case ids; changed rows first (Spec B AC-7). All cells are plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EMPTY, formatCostUsd } from "@/lib/format";
import type { CaseCell, CaseRow } from "../helpers";
import { s } from "../styles";

const COLUMNS = ["case", "outcomeA", "outcomeB", "durationA", "costA", "durationB", "costB"] as const;

export function CompareCasesTable({ rows }: { rows: CaseRow[] }) {
  const t = useTranslations("eval");
  const label = (c: CaseCell) => t(`compare.outcome.${c.kind}`);
  const duration = (c: CaseCell) => (c.duration_ms == null ? EMPTY : t("compare.seconds", { value: (c.duration_ms / 1000).toFixed(1) }));
  return (
    <table style={s.table} aria-label={t("compare.casesHeading")}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c} scope="col" style={s.th}>
              {t(`compare.columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.caseId}>
            <td style={s.td}>
              <span style={s.ellipsis} title={r.name}>
                {r.name}
              </span>
              {r.changed && <span style={s.changed}>{t("compare.changed")}</span>}
            </td>
            <td style={s.td}>{label(r.a)}</td>
            <td style={s.td}>{label(r.b)}</td>
            <td style={s.td}>{duration(r.a)}</td>
            <td style={s.td}>{formatCostUsd(r.a.cost_usd)}</td>
            <td style={s.td}>{duration(r.b)}</td>
            <td style={s.td}>{formatCostUsd(r.b.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
