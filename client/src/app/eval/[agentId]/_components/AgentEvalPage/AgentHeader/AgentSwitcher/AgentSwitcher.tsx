/* AgentSwitcher — a native select that opens another agent's eval page (Spec F
   AC-9, AC-10). Native, so the keyboard model is the browser's. Choosing an
   option changes the page, so the control says so in its description (WCAG
   3.2.2). Not rendered while the dashboard loads or failed (EC-7). Option text
   is plain text. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { VISUALLY_HIDDEN } from "@/lib/visually-hidden";
import { switcherOptions } from "./helpers";
import { s } from "./styles";

export function AgentSwitcher({ currentId, currentName }: { currentId: string; currentName: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const dashboard = useEvalDashboard();
  const uid = React.useId();
  const selectId = `${uid}-select`;
  const descId = `${uid}-desc`;

  if (!dashboard.data) return null;
  const options = switcherOptions(dashboard.data, { id: currentId, name: currentName });

  return (
    <div style={s.wrap}>
      <label htmlFor={selectId} style={VISUALLY_HIDDEN}>
        {t("agentPage.switcher.label")}
      </label>
      <select
        id={selectId}
        aria-describedby={descId}
        value={currentId}
        style={s.select}
        onChange={(e) => {
          const id = e.target.value;
          if (id && id !== currentId) router.push(`/eval/${id}`);
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <span id={descId} style={VISUALLY_HIDDEN}>
        {t("agentPage.switcher.description")}
      </span>
    </div>
  );
}
