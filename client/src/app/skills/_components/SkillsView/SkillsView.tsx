/* /skills — master–detail: searchable skill list (left) + selected skill with Config / Preview / Stats / Versions (right). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { getErrorMessage, useDeleteSkill, useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillDetail, parseSkillTab, type SkillTab } from "../SkillDetail";
import { SkillEditorDrawer, type EditorTabKey } from "./_components/SkillEditorDrawer";
import { SkillList } from "./_components/SkillList";
import { DeleteSkillModal } from "./_components/DeleteSkillModal";
import { buildSkillsHref, resolveSelectedId } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const del = useDeleteSkill();
  const [drawer, setDrawer] = React.useState<EditorTabKey | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Skill | null>(null);

  const list = skills ?? [];
  const selectedId = resolveSelectedId(list, params.get("id"));
  const selected = list.find((sk) => sk.id === selectedId) ?? null;
  const tab = parseSkillTab(params.get("tab"));

  const go = (id: string | null, nextTab: SkillTab) => router.replace(buildSkillsHref(id, nextTab));

  const afterDelete = (deletedId: string) => go(list.find((sk) => sk.id !== deletedId)?.id ?? null, tab);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success(t("page.deleted"));
        afterDelete(pendingDelete.id);
        setPendingDelete(null);
      },
      onError: (err) => toast.error(getErrorMessage(err, t("preview.deleteFailed"))),
    });
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {drawer && (
        <SkillEditorDrawer initialTab={drawer} onClose={() => setDrawer(null)} onCreated={(sk) => go(sk.id, "config")} />
      )}
      {pendingDelete && (
        <DeleteSkillModal
          name={pendingDelete.name}
          busy={del.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
      <div style={s.layout}>
        <SkillList
          skills={list}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          selectedId={selectedId}
          onSelect={(id) => go(id, tab)}
          onAdd={setDrawer}
          onAskDelete={setPendingDelete}
        />
        <main style={s.detail}>
          {isLoading && (
            <div style={s.detailSkeleton}>
              <Skeleton height={36} />
              <Skeleton height={240} />
            </div>
          )}
          {!isLoading && !isError && list.length === 0 && (
            <div style={s.center}>
              <EmptyState
                icon="Zap"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setDrawer("file")}
              />
            </div>
          )}
          {selected && (
            <SkillDetail
              skill={selected}
              tab={tab}
              onTabChange={(next) => go(selected.id, next)}
              onAskDelete={() => setPendingDelete(selected)}
            />
          )}
        </main>
      </div>
    </AppShell>
  );
}
