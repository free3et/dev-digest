/* Context tab of the skill editor: attach Project Context documents of the active repo to the skill;
   every agent using the skill inherits them. No inherited rows here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { useContextFiles } from "@/lib/hooks/core";
import { useSkillContextDocs, useSetSkillContextDocs } from "@/lib/hooks/context-docs";
import { getErrorMessage } from "@/lib/hooks/skills";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ContextDocsPicker, resolveOwn, rowTokens, serializeLines } from "@/components/context-docs/ContextDocsPicker";
import type { ContextDocList, SkillContextDocs } from "@/lib/types";
import { s } from "./styles";

export function SkillContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const docs = useContextFiles(repoId);
  const attached = useSkillContextDocs(skillId, repoId);

  if (!repoId) return <p style={s.hint}>{t("contextTab.noRepo")}</p>;
  if (docs.isError || attached.isError) {
    return (
      <ErrorState
        body={t("contextTab.loadError")}
        onRetry={() => {
          if (docs.isError) docs.refetch();
          if (attached.isError) attached.refetch();
        }}
      />
    );
  }
  if (!docs.data || !attached.data) {
    return (
      <div role="status" aria-label={t("contextTab.loading")} style={s.center}>
        <span aria-hidden style={s.spinner} />
        {t("contextTab.loading")}
      </div>
    );
  }
  return <ContextBody key={repoId} skillId={skillId} repoId={repoId} list={docs.data} server={attached.data} />;
}

function ContextBody({
  skillId, repoId, list, server,
}: {
  skillId: string;
  repoId: string;
  list: ContextDocList;
  server: SkillContextDocs;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const save = useSetSkillContextDocs(skillId, repoId);
  // Local order, so the footer reacts on click; null = follow the server list.
  const [local, setLocal] = React.useState<string[] | null>(null);
  const inflight = React.useRef(0);

  const paths = local ?? server.docs.map((a) => a.path);
  const own = resolveOwn(paths, server.docs, list.documents);
  const total = own.reduce((n, a) => n + rowTokens(a), 0);

  const onChange = (next: string[]) => {
    setLocal(next);
    inflight.current += 1;
    save.mutate(next, {
      onError: (err) => toast.error(getErrorMessage(err, t("contextTab.updateFailed"))),
      onSettled: () => {
        inflight.current -= 1;
        if (inflight.current === 0) setLocal(null);
      },
    });
  };

  return (
    <div>
      <h2 style={s.title}>{t("contextTab.title")}</h2>
      <p style={s.hint}>{t("contextTab.hint", { count: server.used_by_agents })}</p>
      <ContextDocsPicker repoId={repoId} own={own} documents={list.documents} onChange={onChange} />
      <div style={s.serializesTitle}>{t("contextTab.serializesAs")}</div>
      <pre aria-label={t("contextTab.serializesAs")} style={s.serializes}>
        {serializeLines(paths).join("\n")}
      </pre>
      <div style={s.footer}>
        <div style={s.total}>{t("contextTab.footer", { total })}</div>
        <div style={s.caption}>{t("contextTab.caption")}</div>
      </div>
    </div>
  );
}
