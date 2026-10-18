/* CompareRunInfo — run A and run B side by side: ran_at, agent version and
   skills (Spec B AC-6, kept by Spec D AC-8). The metric rows moved to the
   tiles in `CompareTiles`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { RanAt } from "@/components/eval-metric";
import { EMPTY } from "@/lib/format";
import type { EvalHost, EvalOwner } from "@/lib/hooks/eval";
import { hostLabel, runVersion } from "../../helpers";
import { s } from "../styles";

export function CompareRunInfo({
  a,
  b,
  kind = "agent",
  hosts,
}: {
  a: EvalSuiteRun;
  b: EvalSuiteRun;
  /** `skill` labels the version row "Skill version" and adds the Host row (Spec G2). */
  kind?: EvalOwner["kind"];
  hosts?: ReadonlyMap<string, EvalHost>;
}) {
  const t = useTranslations("eval");
  const isSkill = kind === "skill";
  const hostText = (r: EvalSuiteRun) => {
    const l = hostLabel(hosts, r.agent_id, r.agent_version);
    return l.kind === "known"
      ? t("skillEvals.history.hostCell", { name: l.name, version: l.version })
      : l.kind === "deleted"
        ? t("skillEvals.history.deletedAgent")
        : EMPTY;
  };
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
            {isSkill ? t("skillEvals.compare.skillVersion") : t("compare.version")}
          </th>
          <td style={s.td}>{t("history.version", { version: runVersion(a, kind) })}</td>
          <td style={s.td}>{t("history.version", { version: runVersion(b, kind) })}</td>
        </tr>
        {isSkill && (
          <tr>
            <th scope="row" style={s.th}>
              {t("skillEvals.compare.host")}
            </th>
            <td style={s.td}>
              <span style={s.ellipsis} title={hostText(a)}>
                {hostText(a)}
              </span>
            </td>
            <td style={s.td}>
              <span style={s.ellipsis} title={hostText(b)}>
                {hostText(b)}
              </span>
            </td>
          </tr>
        )}
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
