"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

interface Props {
  name: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSkillModal({ name, busy, onCancel, onConfirm }: Props) {
  const t = useTranslations("skills");
  return (
    <Modal
      width={420}
      title={t("deleteModal.title")}
      onClose={busy ? undefined : onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onCancel} disabled={busy}>
            {t("deleteModal.cancel")}
          </Button>
          <Button kind="danger" onClick={onConfirm} loading={busy}>
            {t("deleteModal.confirm")}
          </Button>
        </div>
      }
    >
      <p style={s.body}>{t("deleteModal.body", { name })}</p>
    </Modal>
  );
}
