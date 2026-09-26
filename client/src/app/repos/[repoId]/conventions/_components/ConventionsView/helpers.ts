import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CONVENTIONS_SKILL_NAME } from "./constants";

export function acceptedCount(rows: readonly ConventionCandidate[]): number {
  return rows.filter((c) => c.accepted).length;
}

export function repoShortName(fullName: string): string {
  return fullName.split("/").pop() || fullName;
}

/** Legacy mock name `{repo}-conventions`; lookup only — modal defaults to CONVENTIONS_SKILL_NAME. */
export function skillNameForRepo(fullName: string): string {
  const base = `${repoShortName(fullName)}-conventions`.replace(/[^A-Za-z0-9._-]+/g, "-");
  const named = /^[A-Za-z0-9]/.test(base) ? base : `r${base}`;
  return named.slice(0, 80);
}

export function findConventionsSkill(skills: readonly Skill[], ...names: string[]): Skill | undefined {
  const wanted = new Set(names.filter(Boolean));
  wanted.add(CONVENTIONS_SKILL_NAME);
  return skills.find((sk) => wanted.has(sk.name));
}

export function evidenceHref(
  repoFullName: string,
  defaultBranch: string,
  path: string,
  line: number | null,
): string {
  return githubBlobUrl(repoFullName, defaultBranch, path, line ?? undefined);
}

/** `path:12` or `path:23-31` when the snippet spans extra lines. */
export function evidenceRangeLabel(path: string, start: number | null, snippet: string): string {
  if (start == null) return path;
  const extra = snippet.split("\n").length - 1;
  return extra > 0 ? `${path}:${start}-${start + extra}` : `${path}:${start}`;
}
