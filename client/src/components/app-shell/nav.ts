/* Registers Skills Lab items. The nav list lives in vendored
   `@devdigest/ui` (do not edit); the sidebar reads the exported NAV array by
   reference, so the app extends it here, once, idempotently. */
import { NAV } from "@devdigest/ui";

const SKILLS_LAB_SECTION = "SKILLS LAB";
const WORKSPACE_SECTION = "WORKSPACE";

export function registerSkillsNav(): void {
  const present = NAV.some((g) => g.items.some((it) => it.key === "skills"));
  if (present) return;
  NAV.push({
    section: SKILLS_LAB_SECTION,
    items: [{ key: "skills", label: "Skills", icon: "Zap", href: "/skills", gKey: "s" }],
  });
}

/** Agents belong with Skills / Conventions, not under WORKSPACE. */
export function registerAgentsInSkillsLab(): void {
  registerSkillsNav();
  const workspace = NAV.find((g) => g.section === WORKSPACE_SECTION);
  const lab = NAV.find((g) => g.section === SKILLS_LAB_SECTION);
  if (!workspace || !lab) return;
  const i = workspace.items.findIndex((it) => it.key === "agents");
  if (i < 0) return;
  const [agents] = workspace.items.splice(i, 1);
  if (!agents || lab.items.some((it) => it.key === "agents")) return;
  const afterSkills = lab.items.findIndex((it) => it.key === "skills");
  lab.items.splice(afterSkills < 0 ? lab.items.length : afterSkills + 1, 0, agents);
}

export function registerConventionsNav(): void {
  registerSkillsNav();
  const group = NAV.find((g) => g.section === SKILLS_LAB_SECTION);
  if (!group || group.items.some((it) => it.key === "conventions")) return;
  group.items.push({
    key: "conventions",
    label: "Conventions",
    icon: "ListChecks",
    href: "/repos/:repoId/conventions",
    gKey: "c",
  });
}

registerSkillsNav();
registerAgentsInSkillsLab();
registerConventionsNav();
