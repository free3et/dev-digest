/* Project Context document picker: rows (own attached, inherited read-only, rest of the repo),
   filter, preview dialog, reorder by drag or Move up / Move down. Props-driven; the owner saves. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { ContextAttachment, InheritedContextAttachment, SpecFile } from "@devdigest/shared";
import { PreviewDialog } from "./PreviewDialog";
import { attach, attachedCount, buildRows, detach, filterRows, move, moveToTarget } from "./helpers";
import { s } from "./styles";

export interface ContextDocsPickerProps {
  repoId: string;
  /** Own attached documents, in attach order. */
  own: readonly ContextAttachment[];
  /** Documents inherited from skills (read-only); omit for a skill. */
  inherited?: readonly InheritedContextAttachment[];
  /** Every document of the repo. */
  documents: readonly SpecFile[];
  /** Receives the full ordered own path list after every toggle, reorder or detach. */
  onChange: (paths: string[]) => void;
}

export function ContextDocsPicker({ repoId, own, inherited = [], documents, onChange }: ContextDocsPickerProps) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [overPath, setOverPath] = React.useState<string | null>(null);

  const paths = own.map((a) => a.path);
  const rows = buildRows(own, inherited, documents);
  const visible = filterRows(rows, filter);
  const { attached, total } = attachedCount(own, documents);

  const emit = (next: string[]) => {
    if (next.join("\n") !== paths.join("\n")) onChange(next);
  };

  return (
    <div>
      <div style={s.head}>
        <Badge>{t("picker.attachedCount", { attached, total })}</Badge>
        <div style={s.spacer} />
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            aria-label={t("picker.filterLabel")}
            placeholder={t("picker.filterPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={s.filterInput}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={s.empty}>{t("picker.empty")}</p>
      ) : visible.length === 0 ? (
        <p style={s.empty}>{t("picker.noMatch")}</p>
      ) : (
        <ul aria-label={t("picker.listLabel")} style={s.list}>
          {visible.map((row) => {
            const isOwn = row.kind === "own";
            const index = paths.indexOf(row.path);
            return (
              <li
                key={row.path}
                draggable={isOwn}
                onDragStart={(e) => {
                  if (!isOwn) return;
                  setDragPath(row.path);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", row.path);
                }}
                onDragOver={(e) => {
                  if (!dragPath || !isOwn) return;
                  e.preventDefault();
                  setOverPath(row.path);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragPath && isOwn) emit(moveToTarget(paths, dragPath, row.path));
                  setDragPath(null);
                  setOverPath(null);
                }}
                onDragEnd={() => {
                  setDragPath(null);
                  setOverPath(null);
                }}
                style={{ ...s.row, ...(overPath === row.path && dragPath !== row.path ? s.rowOver : null) }}
              >
                {isOwn ? (
                  <span aria-hidden style={s.handle} title={t("picker.dragHandle", { path: row.path })}>
                    ⋮⋮
                  </span>
                ) : (
                  <span aria-hidden style={s.handleMuted} />
                )}
                <input
                  type="checkbox"
                  aria-label={row.path}
                  checked={row.kind !== "repo"}
                  disabled={row.kind === "inherited"}
                  onChange={(e) => emit(e.target.checked ? attach(paths, row.path) : detach(paths, row.path))}
                />
                <div style={s.names} title={row.path}>
                  <span className="mono" style={s.name}>{row.name}</span>
                  {row.folder && <span style={s.folder}>{row.folder}</span>}
                </div>
                {row.skillName !== undefined && <span style={s.via}>{t("picker.viaSkill", { name: row.skillName })}</span>}
                {row.docType && <Badge>{t(`picker.type.${row.docType}`)}</Badge>}
                {row.missing ? (
                  <>
                    <span style={s.warn}>{t("picker.missing")}</span>
                    <button
                      type="button"
                      aria-label={t("picker.detachLabel", { path: row.path })}
                      style={s.detach}
                      onClick={() => emit(detach(paths, row.path))}
                    >
                      {t("picker.detach")}
                    </button>
                  </>
                ) : row.tooLarge ? (
                  <span style={s.warn}>{t("picker.tooLarge")}</span>
                ) : (
                  <span style={s.tokens}>{t("picker.tokens", { count: row.approxTokens ?? 0 })}</span>
                )}
                {!row.missing && (
                  <IconBtn icon="Eye" label={t("picker.preview", { path: row.path })} onClick={() => setPreviewPath(row.path)} />
                )}
                {isOwn && (
                  <>
                    <IconBtn
                      icon="ArrowUp"
                      label={t("picker.moveUp", { path: row.path })}
                      onClick={index <= 0 ? undefined : () => emit(move(paths, row.path, -1))}
                    />
                    <IconBtn
                      icon="ArrowDown"
                      label={t("picker.moveDown", { path: row.path })}
                      onClick={index < 0 || index >= paths.length - 1 ? undefined : () => emit(move(paths, row.path, 1))}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {previewPath && <PreviewDialog repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />}
    </div>
  );
}
