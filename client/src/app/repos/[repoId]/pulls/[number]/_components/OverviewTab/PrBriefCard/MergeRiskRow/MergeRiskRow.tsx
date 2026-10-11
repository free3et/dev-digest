"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_TONE } from "../constants";
import { s } from "./styles";

/** One merge risk. Model text is rendered as plain text (never as markup). */
export function MergeRiskRow({ risk }: { risk: Risk }) {
  const t = useTranslations("brief.card");
  const tone = SEVERITY_TONE[risk.severity];
  return (
    <li style={s.row}>
      <div style={s.head}>
        <Badge color={tone.color} bg={tone.bg}>
          {t(`severity.${risk.severity}`)}
        </Badge>
        <span style={s.title} title={risk.title}>
          {risk.title}
        </span>
      </div>
      <p style={s.explanation}>{risk.explanation}</p>
      {risk.file_refs.length > 0 && (
        <div style={s.refs}>
          {risk.file_refs.map((f) => (
            <span key={f} className="mono" style={s.ref} title={f}>
              {f}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
