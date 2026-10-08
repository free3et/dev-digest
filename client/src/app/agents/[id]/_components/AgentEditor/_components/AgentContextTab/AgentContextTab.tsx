/* Context tab of the agent editor: attach Project Context documents of the active repo,
   see inherited (via skill) ones read-only, and the token estimate for each review pass. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { useContextFiles } from "@/lib/hooks/core";
import { useAgentContextDocs, useSetAgentContextDocs } from "@/lib/hooks/context-docs";
import { getErrorMessage } from "@/lib/hooks/skills";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ContextDocsPicker, resolveOwn, totals } from "@/components/context-docs/ContextDocsPicker";
import type { AgentContextDocs, ContextDocList } from "@/lib/types";
import { s } from "./styles";

export function AgentContextTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const docs = useContextFiles(repoId);
  const attached = useAgentContextDocs(agentId, repoId);

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
  return <ContextBody key={repoId} agentId={agentId} repoId={repoId} list={docs.data} server={attached.data} />;
}

function ContextBody({
  agentId, repoId, list, server,
}: {
  agentId: string;
  repoId: string;
  list: ContextDocList;
  server: AgentContextDocs;
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const save = useSetAgentContextDocs(agentId, repoId);
  // Local order, so the footer reacts on click; null = follow the server list.
  const [local, setLocal] = React.useState<string[] | null>(null);
  const inflight = React.useRef(0);

  const paths = local ?? server.own.map((a) => a.path);
  const own = resolveOwn(paths, server.own, list.documents);
  const sum = totals(own, server.inherited);

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
      <p style={s.hint}>{t("contextTab.hint")}</p>
      <ContextDocsPicker
        repoId={repoId}
        own={own}
        inherited={server.inherited}
        documents={list.documents}
        onChange={onChange}
      />
      <div style={s.footer}>
        <div style={s.total}>
          {t("contextTab.footer", { total: sum.total, own: sum.own, inherited: sum.inherited })}
        </div>
        <div style={s.caption}>{t("contextTab.caption")}</div>
      </div>
    </div>
  );
}
