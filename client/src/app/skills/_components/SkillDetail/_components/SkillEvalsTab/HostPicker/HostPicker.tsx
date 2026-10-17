/* HostPicker — which agent hosts the skill's eval runs (Spec G2 AC-5, AC-6).
   A native <select> (the vendored SelectInput takes no id/aria-label, client
   INSIGHTS 2026-09-19) with a visible <label>. With no host selected the hint
   explains why running is disabled; it is the description of the run controls. */
"use client";

import React, { useId } from "react";
import { useTranslations } from "next-intl";
import type { EvalHost } from "@/lib/hooks/eval";
import { s } from "./styles";

export interface HostPickerProps {
  agents: readonly EvalHost[] | undefined;
  value: string | null;
  onChange: (agentId: string | null) => void;
  /** Id of the hint paragraph, referenced by the run controls. */
  hintId: string;
}

export function HostPicker({ agents, value, onChange, hintId }: HostPickerProps) {
  const t = useTranslations("eval");
  const id = useId();
  const label = (a: EvalHost) => t("skillEvals.host.option", { name: a.name, model: a.model });
  const selected = agents?.find((a) => a.id === value);
  return (
    <div style={s.wrap}>
      <div style={s.row}>
        <label htmlFor={id} style={s.label}>
          {t("skillEvals.host.label")}
        </label>
        <select
          id={id}
          value={value ?? ""}
          title={selected ? label(selected) : undefined}
          disabled={!agents}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          style={s.select}
        >
          <option value="">{t("skillEvals.host.none")}</option>
          {agents?.map((a) => (
            <option key={a.id} value={a.id} title={label(a)}>
              {label(a)}
            </option>
          ))}
        </select>
      </div>
      {value === null && (
        <p id={hintId} style={s.hint}>
          {t("skillEvals.host.hint")}
        </p>
      )}
    </div>
  );
}
