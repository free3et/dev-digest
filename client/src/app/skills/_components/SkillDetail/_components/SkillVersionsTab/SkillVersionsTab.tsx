"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { getErrorMessage, useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { isCurrentVersion } from "./helpers";
import { s } from "./styles";

export function SkillVersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const q = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [diff, setDiff] = React.useState<SkillVersion | null>(null);

  const restore = (row: SkillVersion) => {
    update.mutate(
      { id: skill.id, patch: { body: row.body } },
      {
        onSuccess: () => toast.success(t("versions.restored", { version: row.version })),
        onError: (err) => toast.error(getErrorMessage(err, t("versions.restoreFailed"))),
      },
    );
  };

  if (q.isError) {
    return <ErrorState body={t("versions.loadError")} onRetry={() => void q.refetch()} />;
  }
  if (q.isLoading || !q.data) {
    return (
      <div style={s.root} data-testid="skill-versions-loading">
        <Skeleton height={28} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.head}>
        <div style={s.titleRow}>
          <h3 style={s.title}>{t("versions.title")}</h3>
          <span style={s.count}>{t("versions.count", { count: q.data.length })}</span>
        </div>
        <p style={s.hint}>{t("versions.hint")}</p>
      </div>
      <div style={s.list}>
        {q.data.map((row) => {
          const current = isCurrentVersion(row.version, skill.version);
          return (
            <div key={row.version} style={s.row}>
              <span className="mono" style={s.version}>
                {t("preview.version", { version: row.version })}
              </span>
              {current && (
                <Badge color="var(--ok)" bg="var(--ok-bg)">
                  {t("versions.current")}
                </Badge>
              )}
              <span style={s.spacer} />
              <span style={s.actions}>
                <Button kind="secondary" size="sm" onClick={() => setDiff(row)}>
                  {t("versions.diff")}
                </Button>
                {!current && (
                  <Button kind="secondary" size="sm" onClick={() => restore(row)} loading={update.isPending}>
                    {t("versions.restore")}
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {diff && (
        <Modal
          width={880}
          title={t("versions.diffTitle")}
          onClose={() => setDiff(null)}
          footer={
            <div style={s.diffFooter}>
              <Button kind="secondary" onClick={() => setDiff(null)}>
                {t("versions.close")}
              </Button>
            </div>
          }
        >
          <div style={s.diffBody}>
            <div style={s.pane}>
              <div style={s.paneLabel}>{t("versions.diffFrom", { version: diff.version })}</div>
              <pre className="mono" style={s.paneBody}>
                {diff.body}
              </pre>
            </div>
            <div style={s.paneLast}>
              <div style={s.paneLabel}>{t("versions.diffCurrent", { version: skill.version })}</div>
              <pre className="mono" style={s.paneBody}>
                {skill.body}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
