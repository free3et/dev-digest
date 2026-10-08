"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useContextFiles } from "@/lib/hooks/core";
import { formatTokenCount } from "@/lib/format";
import { DocList } from "./DocList";
import { DocPanel } from "./DocPanel";
import { footerTotals, relativeAge } from "./helpers";
import { s } from "./styles";

export function ContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const list = useContextFiles(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  const data = list.data;
  const docs = data?.documents ?? [];
  const totals = footerTotals(docs);

  let content: React.ReactNode;
  if (list.isLoading) {
    content = <Skeleton height={180} />;
  } else if (list.isError) {
    content = <ErrorState body={t("states.loadError")} onRetry={() => list.refetch()} />;
  } else if (data && !data.cloned) {
    content = <EmptyState icon="FileText" title={t("states.notCloned.title")} body={t("states.notCloned.body")} />;
  } else if (data && docs.length === 0) {
    content = (
      <EmptyState
        icon="FileText"
        title={t("states.empty.title")}
        body={t("states.empty.body")}
      />
    );
  } else if (data) {
    const age = relativeAge(data.refreshed_at);
    content = (
      <div style={s.body}>
        <div style={s.listCard}>
          <DocList docs={docs} selected={selected} onSelect={setSelected} />
          <div style={s.footer}>
            {t("footer.summary", {
              count: totals.count,
              tokens: formatTokenCount(totals.tokens),
              when: t(`footer.relative.${age.unit}`, { count: age.count }),
            })}
          </div>
        </div>
        <div>
          {selected ? (
            <DocPanel key={selected} repoId={repoId} path={selected} />
          ) : (
            <p style={s.prompt}>{t("states.selectPrompt")}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.titles}>
          <h1 style={s.title}>{t("title")}</h1>
          <p style={s.subtitle}>{t("subtitle")}</p>
        </div>
        <Button kind="secondary" icon="RefreshCw" loading={list.isFetching} onClick={() => list.refetch()}>
          {t("list.refresh")}
        </Button>
      </div>
      {content}
    </div>
  );
}
