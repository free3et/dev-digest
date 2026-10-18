/* EvalRunConfirm — the cost confirmation shown before any suite run (Spec B
   AC-1, Spec G2 AC-8). For an agent it names the case count and the last cost;
   for a skill it also names the host agent and its model, because they decide
   what the run costs. Nothing is sent from here: the caller owns the request. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalHost } from "@/lib/hooks/eval";
import { s } from "./styles";

export interface EvalRunConfirmProps {
  count: number;
  /** Already formatted cost of the last finished run ("—" when none). */
  lastCost: string;
  /** Present for a skill suite: the agent that runs the cases. */
  host?: EvalHost;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EvalRunConfirm({ count, lastCost, host, onConfirm, onCancel }: EvalRunConfirmProps) {
  const t = useTranslations("eval");
  return (
    <Modal
      width={440}
      title={t("evalsTab.confirm.title", { count })}
      onClose={onCancel}
      footer={
        <div style={s.modalFooter}>
          <Button kind="secondary" onClick={onCancel}>
            {t("evalsTab.confirm.cancel")}
          </Button>
          <Button kind="primary" onClick={onConfirm}>
            {t("evalsTab.confirm.confirm")}
          </Button>
        </div>
      }
    >
      <p style={s.modalBody}>
        {host
          ? t("skillEvals.confirm.body", { host: host.name, model: host.model, cost: lastCost })
          : t("evalsTab.confirm.body", { cost: lastCost })}
      </p>
    </Modal>
  );
}
