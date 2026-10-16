/* EvalCaseControl — the single eval control of a decided FindingCard (Spec A
   AC-5): a "Turn into eval case" button naming the expectation, or an
   "In eval set" link once a case exists for the finding. The button only
   opens the EvalCaseModal (Spec C AC-10); nothing is stored until Save. */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useAgentEvalCases } from "@/lib/hooks/eval";
import { EvalCaseModal } from "./EvalCaseModal";
import { evalControlState } from "./helpers";
import { s } from "./styles";

export function EvalCaseControl({ f, agentId }: { f: FindingRecord; agentId: string }) {
  const t = useTranslations("prReview");
  const cases = useAgentEvalCases(agentId);
  const [open, setOpen] = useState(false);

  // Wait for the list so an existing case shows the link, not a button that
  // would only come back as `duplicate`. A failed list falls back to the
  // button: the server still refuses duplicates.
  if (cases.isLoading) return null;
  const state = evalControlState(f, agentId, cases.data ?? []);
  if (state.kind === "none") return null;

  if (state.kind === "link") {
    return (
      <Link href={state.href} style={s.link}>
        {t("finding.evalCase.inSet")}
      </Link>
    );
  }

  const label =
    state.expectation === "must_find"
      ? t("finding.evalCase.turnIntoMustFind")
      : t("finding.evalCase.turnIntoMustNotFlag");

  return (
    <div style={s.wrap}>
      <Button kind="secondary" size="sm" icon="Plus" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <EvalCaseModal
          findingId={f.id}
          agentId={agentId}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}
    </div>
  );
}
