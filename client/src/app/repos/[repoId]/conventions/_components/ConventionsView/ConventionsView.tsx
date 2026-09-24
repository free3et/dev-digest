"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { getErrorMessage, useCreateSkill, useLinkAgentSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useAgents } from "@/lib/hooks/agents";
import {
  useConventionSkillDraft,
  useConventions,
  useExtractConventions,
  useRejectConvention,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { CONVENTIONS_SKILL_NAME } from "./constants";
import {
  acceptedCount,
  evidenceHref,
  findConventionsSkill,
  repoShortName,
  skillNameForRepo,
} from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { activeRepo, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const list = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);
  const draftMut = useConventionSkillDraft(repoId);
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const linkSkill = useLinkAgentSkill();
  const skills = useSkills();
  const agents = useAgents();
  const [scanned, setScanned] = React.useState(false);
  const [draft, setDraft] = React.useState<ConventionSkillDraft | null>(null);
  const [bulk, setBulk] = React.useState(false);

  const rows = list.data ?? [];
  const fullName = activeRepo?.full_name ?? "";
  const short = fullName ? repoShortName(fullName) : t("page.repoFallback");
  const branch = activeRepo?.default_branch ?? "main";
  const accepted = acceptedCount(rows);
  const legacyName = fullName ? skillNameForRepo(fullName) : "";
  const fail = (err: unknown, fallback: string) => toast.error(getErrorMessage(err, fallback));

  const runExtract = () =>
    extract.mutate(undefined, {
      onSuccess: () => setScanned(true),
      onError: (err) => fail(err, t("page.extractionFailed")),
    });

  const openDraft = () =>
    draftMut.mutate(undefined, {
      onSuccess: (d) => {
        const existing = findConventionsSkill(skills.data ?? [], CONVENTIONS_SKILL_NAME, d.name, legacyName);
        setDraft({ ...d, name: existing?.name ?? CONVENTIONS_SKILL_NAME });
      },
      onError: (err) => fail(err, t("modal.noAccepted")),
    });

  const deselectAll = async () => {
    setBulk(true);
    try {
      for (const c of rows.filter((r) => r.accepted)) {
        await update.mutateAsync({ id: c.id, patch: { accepted: false } });
      }
    } catch (err) {
      fail(err, t("page.loadError"));
    } finally {
      setBulk(false);
    }
  };

  const saveSkill = async (values: {
    name: string;
    description: string;
    body: string;
    type: SkillType;
    enabled: boolean;
    agentId: string | null;
  }) => {
    const existing = findConventionsSkill(skills.data ?? [], values.name, CONVENTIONS_SKILL_NAME, legacyName);
    try {
      const skill = existing
        ? await updateSkill.mutateAsync({
            id: existing.id,
            patch: {
              name: values.name,
              description: values.description,
              type: values.type,
              body: values.body,
              enabled: values.enabled,
            },
          })
        : await createSkill.mutateAsync({
            name: values.name,
            description: values.description,
            type: values.type,
            body: values.body,
            source: "extracted",
            enabled: values.enabled,
          });
      if (values.agentId) await linkSkill.mutateAsync({ agentId: values.agentId, skillId: skill.id });
      toast.success(values.agentId ? t("modal.linked") : t("modal.saved"));
      setDraft(null);
    } catch (err) {
      fail(err, t("page.extractionFailed"));
    }
  };

  const crumb = [
    { label: t("page.crumbLab"), href: "/skills" },
    { label: t("page.crumbConventions") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const subtitle = rows.length
    ? scanned
      ? `${t("page.detected", { count: rows.length })} · ${t("page.lastScanNow")}`
      : t("page.detected", { count: rows.length })
    : t("page.subtitle");

  return (
    <AppShell crumb={crumb}>
      {draft && (
        <CreateSkillModal
          draft={draft}
          agents={agents.data ?? []}
          existing={findConventionsSkill(skills.data ?? [], draft.name, CONVENTIONS_SKILL_NAME, legacyName)}
          repoLabel={short}
          busy={createSkill.isPending || updateSkill.isPending || linkSkill.isPending}
          onClose={() => setDraft(null)}
          onSave={saveSkill}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.titles}>
            {reposLoaded || activeRepo ? (
              <h1 style={s.title}>
                {t("page.headingPrefix")}
                <span style={s.repo}>{short}</span>
              </h1>
            ) : (
              <Skeleton height={28} />
            )}
            <p style={s.subtitle}>{extract.isPending ? t("page.scanning") : subtitle}</p>
          </div>
          {rows.length === 0 ? (
            <Button kind="ghost" icon="Play" loading={extract.isPending} onClick={runExtract}>
              {t("page.runExtraction")}
            </Button>
          ) : (
            <Button kind="ghost" icon="RefreshCw" loading={extract.isPending} onClick={runExtract}>
              {t("page.rescan")}
            </Button>
          )}
        </div>
        {list.isError && <ErrorState body={t("page.loadError")} onRetry={() => list.refetch()} />}
        {list.isLoading && <Skeleton height={180} />}
        {!list.isLoading && !list.isError && rows.length === 0 && (
          <div style={s.empty}>
            <EmptyState
              icon="ListChecks"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={runExtract}
            />
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div style={s.toolbar}>
              <Button kind="ghost" size="sm" disabled={accepted === 0 || bulk} onClick={() => void deselectAll()}>
                {t("page.deselectAll")}
              </Button>
              <span>{t("page.acceptedOf", { accepted, total: rows.length })}</span>
              <span style={s.toolbarGrow} />
              <Button kind="primary" disabled={accepted === 0 || draftMut.isPending} loading={draftMut.isPending} onClick={openDraft}>
                {t("page.createSkill")}
              </Button>
            </div>
            <div style={s.list}>
              {rows.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  evidenceUrl={evidenceHref(fullName || short, branch, c.evidence_path, c.evidence_line)}
                  busy={update.isPending || reject.isPending || bulk}
                  onAccept={() => update.mutate({ id: c.id, patch: { accepted: true } }, { onError: (err) => fail(err, t("page.loadError")) })}
                  onUnaccept={() => update.mutate({ id: c.id, patch: { accepted: false } }, { onError: (err) => fail(err, t("page.loadError")) })}
                  onReject={() => reject.mutate(c.id, { onError: (err) => fail(err, t("page.loadError")) })}
                  onEdit={(patch) => update.mutate({ id: c.id, patch }, { onError: (err) => fail(err, t("page.loadError")) })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
