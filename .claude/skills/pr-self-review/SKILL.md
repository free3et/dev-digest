---
name: pr-self-review
description: >-
  Pre-PR self review of ALL local changes (branch commits + staged + unstaged +
  untracked) against the repo's own skills. Routes each changed file to the
  matching skills (UI files → frontend/React/Next skills, backend files → onion,
  Fastify, Drizzle, Zod, Postgres skills, security everywhere), runs deterministic
  checks first, verifies findings, and returns a PASS or BLOCK verdict. Any
  verified critical finding on a changed line means BLOCK: do not open the PR and
  do not merge. Run manually with /pr-self-review before opening a pull request (model auto-invocation
  is disabled on purpose: the review is heavy, so it starts only when the user asks).
  Not for reviewing someone else's PR.
disable-model-invocation: true
metadata:
  version: 1.0.0
---

# PR Self Review

Reviews **what you are about to put in a PR**, not the whole repo. Only the
user commits and pushes; this skill never commits, pushes or opens a PR.

Companions: `onion-architecture`, `frontend-ui-architecture`,
`react-best-practices`, `next-best-practices`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `typescript-expert`,
`security`, `react-testing-library` — loaded per the routing table, never all at once.

## Decisions (fixed, from the user)

- **Block on critical only.** `major` / `minor` are reported, never block.
- **Critical counts only on changed lines** (see "Changed-lines rule"). Existing
  debt recorded in `INSIGHTS.md` does not block.
- **No CI layer.** The gate is advisory-by-discipline: the skill says `BLOCK` and
  the user honours it. It cannot technically stop a push or a merge — say so in the
  report when the verdict is `BLOCK`.
- **A waiver exists only if the user explicitly grants it** for a named finding.

## Workflow

### 1. Collect and route

```bash
python3 .claude/skills/pr-self-review/scripts/collect_diff.py [--base <ref>]
```

Output is JSON: `files` (with changed `ranges`), `groups` (skill → files),
`checks` (deterministic checks to run), `packages` (touched packages with their
typecheck/test commands), `notes`. Base is `origin/main`, else `main`; state the base
and its SHA in the report. Routing lives in `routing.json` (edit it, not this file,
to add a skill or path). If there are no `files`, say "nothing to review" and stop.
Docs/skills-only diff: run only the mechanical checks that apply, skip step 3.

### 2. Deterministic checks (no LLM, run first)

Run every item that applies. Details and exact commands: [references/checks.md](references/checks.md).

1. Typecheck + tests of each **touched package**, with that package's own manager
   (`server`/`client` → pnpm, `reviewer-core`/`e2e` → npm; never mix).
2. `schema-needs-migration`, `migration-hygiene`, `contract-sync`, `secrets-scan`
   (from `checks` in the JSON).
3. Forbidden paths: changes under `server/clones/**` or `**/src/vendor/ui/**`.
4. Onion grep checks on changed files (see references/checks.md).

A failing check is a finding with the tool output as evidence, not a guess.

### 3. Skill review (LLM, parallel)

Use the Agent tool (general-purpose), **read-only**, at most 4 agents, split by area:
`ui` (client files), `backend` (server files), `core` (reviewer-core), `cross`
(vendor/shared, migrations, tests). Give each agent only its files, their changed
`ranges`, and the skills `groups` assigns to those files. Prompt template:
[references/agent-prompt.md](references/agent-prompt.md). Skip agents whose file set
is empty. Do not run a skill on files it is not routed to.

### 4. Verify

Every candidate `critical` gets an independent verification: re-read the code at
`file:line`, confirm the claim and that the line is in a changed range, or drop it.
Also drop any finding without concrete evidence. (In this repo's first full audit,
2 of ~70 subagent claims were false — an unverified critical must never block.)

### 5. Verdict

- `BLOCK` — at least one **verified critical on a changed line**.
- `PASS` — none. List `major`/`minor` as advice.
- `PASS_WITH_WAIVER` — every critical has an explicit user waiver, recorded with
  reason and time.

Severity rubric and examples: [references/severity.md](references/severity.md).

### 6. Report and marker

Write `.claude/pr-self-review/report.md` (template:
[references/report-template.md](references/report-template.md)) and
`.claude/pr-self-review/last.json`:

```json
{"version":"1.0.0","base":"origin/main","base_sha":"…","head_sha":"…","dirty":true,
 "verdict":"BLOCK","criticals":[{"id":"C1","file":"…","line":0,"rule":"…"}],
 "waivers":[],"created_at":"ISO-8601"}
```

`dirty` is true when there are uncommitted or untracked changes: the marker then
describes the working tree, not `head_sha`, and must be rerun after committing.
Both files are gitignored. Print a short summary: verdict, criticals with
`file:line` and fix, counts of major/minor, checks run and their result.
On `BLOCK`, end with: "Do not open the PR until these are fixed or you waive them
explicitly. This is not enforced by git or CI."

### 7. Wrap up

Rerun after fixes (only files changed since the marker need re-review, but always
rerun the deterministic checks). If something non-obvious was learned, run
`engineering-insights` (root `CLAUDE.md` requires it after non-trivial tasks).
Optionally offer a PR description drafted from the report (summary, test plan, risks).

## Changed-lines rule

A finding is `critical` only if its `file:line` falls inside a `range` from the
collector (an untracked or added file counts as fully changed). A problem on an
unchanged line is **baseline**: report it under "Baseline (not blocking)" at
`major` at most, or skip if it is already in an `INSIGHTS.md` entry. Exception:
deterministic check failures (typecheck/tests/secrets) — attribute them:

- error location is in a changed file/line → `critical`;
- error is in an unchanged file → still show it, mark `possibly pre-existing or
  caused by this diff`, ask the user; do not silently downgrade or block.

## Guardrails

- Read-only on source: never edit code, run `git commit/push/add`, `pnpm db:generate`
  (it writes files) or `db:migrate`. Suggest fixes; the user applies them.
- Do not touch migrations, `vendor/`, `server/clones/**` (see root `CLAUDE.md`).
- Never paste secret values into the report: show the file, line and type only.
- Exclude `server/clones/**` from every grep/glob.
