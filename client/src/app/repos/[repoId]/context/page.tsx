"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ContextView } from "./_components/ContextView";

/* Route: /repos/:repoId/context. Thin entry — list, preview and edit live in ContextView. */
export default function ContextPage() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const crumb = [{ label: activeRepo?.full_name ?? repoId, mono: true }, { label: t("breadcrumb") }];
  return <AppShell crumb={crumb}>{repoNotFound ? <RepoNotFound /> : <ContextView repoId={repoId} />}</AppShell>;
}
