"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useContextFile, useSaveContextFile } from "@/lib/hooks/core";
import { MarkdownDoc } from "@/components/markdown-doc/MarkdownDoc";
import { isConflict, isDirty } from "./helpers";
import { s } from "./styles";

type Mode = "preview" | "edit";

/** Selected document: Preview/Edit toggle and the rendered markdown; Edit mode is a local textarea with Save/Discard. */
export function DocPanel({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const file = useContextFile(repoId, path);
  const [mode, setMode] = React.useState<Mode>("preview");

  const save = useSaveContextFile(repoId);
  const areaId = React.useId();
  // Edit buffer for one path; null means "untouched" so the textarea shows the loaded content.
  const [draftState, setDraftState] = React.useState<{ path: string; text: string } | null>(null);

  const modes: Mode[] = ["preview", "edit"];
  const content = file.data?.content ?? "";
  const draft = draftState?.path === path ? draftState.text : content;
  const dirty = isDirty(draft, content);
  const conflict = save.isError && isConflict(save.error);

  const discard = () => {
    setDraftState(null);
    save.reset();
  };
  const reload = async () => {
    await file.refetch();
    discard();
    setMode("preview");
  };
  const submit = () => {
    const base_hash = file.data?.content_hash;
    if (!base_hash) return;
    save.mutate({ path, content: draft, base_hash });
  };

  let body: React.ReactNode = null;
  if (file.isLoading) {
    body = <Skeleton height={160} />;
  } else if (file.isError) {
    body = <ErrorState body={t("panel.loadError")} onRetry={() => file.refetch()} />;
  } else if (file.data && mode === "edit") {
    body = (
      <div style={s.editor}>
        <div style={s.banner}>{t("editor.banner")}</div>
        <div style={s.labelRow}>
          <label htmlFor={areaId}>{t("editor.label")}</label>
          {dirty && <span style={s.badge}>{t("editor.unsaved")}</span>}
        </div>
        <textarea
          id={areaId}
          className="mono"
          style={s.textarea}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraftState({ path, text: e.target.value })}
        />
        <div style={s.actions}>
          <button type="button" style={s.toggleBtn} disabled={save.isPending || !dirty} onClick={submit}>
            {save.isPending ? t("editor.saving") : t("editor.save")}
          </button>
          <button type="button" style={s.toggleBtn} disabled={save.isPending} onClick={discard}>
            {t("editor.discard")}
          </button>
        </div>
        {conflict && (
          <div role="alert" style={s.error}>
            {t("editor.conflict")}{" "}
            <button type="button" style={s.toggleBtn} onClick={reload}>
              {t("editor.reload")}
            </button>
          </div>
        )}
        {save.isError && !conflict && (
          <div role="alert" style={s.error}>
            {t("editor.saveError")}
          </div>
        )}
      </div>
    );
  } else if (file.data && mode === "preview") {
    body = (
      <div style={s.content}>
        <MarkdownDoc>{file.data.content ?? ""}</MarkdownDoc>
      </div>
    );
  }

  return (
    <section aria-label={path} style={s.panel}>
      <div style={s.toolbar}>
        <span className="mono" title={path} style={s.path}>
          {path}
        </span>
        <div role="group" aria-label={t("panel.toggleLabel")} style={s.toggle}>
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              style={{ ...s.toggleBtn, ...(mode === m ? s.toggleBtnOn : null) }}
            >
              {t(`panel.${m}`)}
            </button>
          ))}
        </div>
      </div>
      {file.data && (
        <div style={s.usedBy}>{t("panel.usedBy", { count: file.data.used_by_agents })}</div>
      )}
      {body}
    </section>
  );
}
