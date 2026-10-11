/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   ./CLAUDE.md / .claude/CLAUDE.md / any agent / engine change → run the workflow tier
 *   (nested server/ client/ CLAUDE.md deliberately do NOT trigger it)
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * EVAL_ALL=1 (manual workflow_dispatch) ignores the diff and selects every artifact that has evals.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const ALL = process.env.EVAL_ALL === "1";

/** Names of every directory under evals/<tier>/ — used for the "run everything" mode. */
function allNames(tier) {
  const dir = join(EVALS_DIR, tier);
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
}

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

const skillNames = ALL
  ? allNames("skills")
  : touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
const agentNames = ALL
  ? allNames("agents")
  : touched(/^\.claude\/agents\/([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//);

const skills = skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
const agents = agentNames.filter((n) => hasEvals("agents", n));
const skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
// the root or .claude CLAUDE.md, any agent definition, the workflow cases, or the engine itself.
const runWorkflow =
  ALL ||
  changed.some(
  (f) =>
    /^(\.claude\/)?CLAUDE\.md$/.test(f) ||
    /^\.claude\/agents\/.+\.md$/.test(f) ||
    /^evals\/workflow\//.test(f) ||
    /^evals\/src\//.test(f),
  );

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
// A skill can carry skill-creator-format evals (.claude/skills/<n>/evals/) that vitest does not run.
const foreign = (n) => existsSync(join(REPO_ROOT, ".claude", "skills", n, "evals"));
for (const n of skippedSkills) {
  console.error(`SKIP skill ${n} (no vitest evals in evals/skills/${n}${foreign(n) ? "; has skill-creator evals under .claude/skills — not run in CI" : ""})`);
}
for (const n of skippedAgents) console.error(`SKIP agent ${n} (no evals in evals/agents/${n})`);
