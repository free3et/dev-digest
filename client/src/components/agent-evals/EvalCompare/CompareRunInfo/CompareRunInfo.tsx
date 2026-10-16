/* CompareRunInfo — run A and run B side by side: ran_at, agent version and
   skills (Spec B AC-6, kept by Spec D AC-8). The metric rows moved to the
   tiles in `CompareTiles`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { RanAt } from "@/components/eval-metric";
import { s } from "../styles";

export function CompareRunInfo({ a, b }: { a: EvalSuiteRun; b: EvalSuiteRun }) {
  const t = useTranslations("eval");
  const skills = (r: EvalSuiteRun) => (r.skills.length > 0 ? r.skills.join(", ") : t("compare.noSkills"));
  return (
    <table style={s.table} aria-label={t("compare.runInfoHeading")}>
      <thead>
        <tr>
          <th scope="col" style={s.th} />
          <th scope="col" style={s.th}>
            {t("compare.runA")}
          </th>
          <th scope="col" style={s.th}>
            {t("compare.runB")}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" style={s.th}>
            {t("compare.ranAt")}
          </th>
          <td style={s.td}><RanAt iso={a.ran_at} /></td>
          <td style={s.td}><RanAt iso={b.ran_at} /></td>
        </tr>
        <tr>
          <th scope="row" style={s.th}>
            {t("compare.version")}
          </th>
          <td style={s.td}>{t("history.version", { version: a.agent_version })}</td>
          <td style={s.td}>{t("history.version", { version: b.agent_version })}</td>
        </tr>
        <tr>
          <th scope="row" style={s.th}>
            {t("compare.skills")}
          </th>
          <td style={s.td}>
            <span style={s.ellipsis} title={skills(a)}>
              {skills(a)}
            </span>
          </td>
          <td style={s.td}>
            <span style={s.ellipsis} title={skills(b)}>
              {skills(b)}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
