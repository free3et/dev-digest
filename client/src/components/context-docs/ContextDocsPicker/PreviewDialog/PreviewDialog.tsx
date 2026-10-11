"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { useContextFile } from "@/lib/hooks/core";
import { MarkdownDoc } from "@/components/markdown-doc/MarkdownDoc";

/** Modal that renders one repository document as on the Project Context page. */
export function PreviewDialog({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const t = useTranslations("context");
  const file = useContextFile(repoId, path);
  let body: React.ReactNode = null;
  if (file.isLoading) body = <Skeleton height={160} />;
  else if (file.isError) body = <ErrorState body={t("picker.previewError")} onRetry={() => file.refetch()} />;
  else if (file.data) body = <MarkdownDoc>{file.data.content ?? ""}</MarkdownDoc>;
  return (
    <Modal width={760} title={path} onClose={onClose}>
      <div style={{ padding: "16px 24px" }}>{body}</div>
    </Modal>
  );
}
