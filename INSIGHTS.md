# DevDigest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

This is the **root** file: it holds only findings that cross package boundaries.
Anything scoped to one package lives in that package's file —
[`client`](client/INSIGHTS.md) · [`server`](server/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-10-07** — To prove that attached Project Context changes a review, run
  the same PR twice, document attached vs detached, and compare the findings;
  a single run only shows the text reached the prompt. The fixture must not
  hint at the rule: a first fixture whose header comment said "instead of
  going through AgentsService" made the no-document control flag the violation
  too. With a neutral fixture the control produced no architecture finding and
  the attached run did (it echoed `repository.ts`, a word only the document
  contains). Before the first run, open the PR once (`GET /pulls/:id`) or the
  review sees `0 changed file(s)`; detach with `PUT /agents/:id/context-docs`
  `{repo_id, paths: []}`. Pushing a branch to a fork also makes GitHub offer a
  PR into the upstream repo — nobody should click it.

## What Doesn't Work

- **2026-10-11** — An agent eval practice may only ask for what the agent's own
  output contract promises, or no model can pass it and CI goes red for a
  reason that looks like "cheap model": `architecture-reviewer` cases demanded
  an "explicit PASS/FAIL gate verdict" (the template has none; `/run-plan` owns
  the gate via `blocker|high` + confidence ≥ 0.5) and the ids
  `reviewer-core-zero-io` / `reviewer-core-ground-findings-gate`, which exist
  only in the cases file. Result: 0/6 locally on Haiku and 1/4 on CI
  (gemini-2.5-flash) at `threshold: 1.0`, every failure `evidence: null` on
  those practices. Check with `grep -rn '<id>' --exclude-dir=node_modules .`
  before writing a practice; reworded to "attributes the finding to a rule or
  its source doc", severities `blocker/high/medium/low/nit`, threshold 0.8.
  `evals/agents/architecture-reviewer/architecture-reviewer.cases.ts`
  **Then, same day** — the reworded cases went 4/4 on CI and 2/4 on the very
  next run of identical code (gemini-2.5-flash, threshold 0.8): one green LLM-
  judged run is not evidence, so agents are report-first in CI. One of the two
  misses was a contradiction between practices (one allowed `low` findings,
  the other forbade any "fabricated documented-rule violation"; the agent's
  `low` finding cites a rule, so the judge failed it) — read the judge
  `evidence` before blaming the model.

- **2026-10-11** — A `workflow` eval cannot see two things it seems to
  measure: (a) nested `server/`, `client/`, `reviewer-core/` `CLAUDE.md` are
  injected by the harness, never `Read`, so `expectFilesRead: ["server/CLAUDE.md"]`
  is red on a correct run — assert the rule they carry instead
  (`server/INSIGHTS.md`, which "Read INSIGHTS.md first" triggers); (b) reads
  made inside a nested subagent are not in the parent trace: one run spawned
  the built-in `Explore` (146 tool calls) and `server/README.md` /
  `server/INSIGHTS.md` never appeared, so a correct run looked like a skip.
  `evals/src/runtime/run-claude.ts`, `evals/workflow/review-workflow.cases.ts`

- **2026-10-11** — Do not fold dispatch or skill activation into one
  multi-part prompt: with six numbered tasks `claude-haiku-4-5` skipped the
  last three (no `architecture-reviewer`, no `engineering-insights`, no
  `TESTING.md`), 8/16 checks red, while each passed alone. Only doc-reading
  merges safely (one session + one control). Even alone, dispatch is flaky on
  haiku: the same prompt dispatched once and reviewed inline once, so judge it
  with `pnpm eval:repeat -n 2` (the cap), not one run (re-checked: 2/2).
  `evals/workflow/review-workflow.cases.ts`
  **Also on gemini-2.5-flash, 2026-10-11** — the 4-part docs-routing prompt
  read only `server/*` and skipped parts 2–4 (4 red checks of 1–4 ms each:
  they assert on the one shared trace). Split into two 2-part sessions; the
  six-session cap is now exactly used, so a new session needs a dropped one.

- **2026-10-11** — a "flaky regression" in an `evals/` quality case can be a
  bad fixture, not a bad skill: `dependency-checker` scored 67% vs baseline
  100% on "three zod versions = drift" because the inlined `REPO_DATA` had only
  two distinct versions (the skill was right), and 67% on "distinguishes
  `@shared/review-types`" because the skill names the real alias
  `@devdigest/shared`. Before tuning a skill, read the judge `evidence` in
  `evals/results/records.jsonl`; keep fixture literals identical to repo names.
  Also `pnpm eval:repeat -n 5` is silently capped at `MAX_TIMES = 2`
  (`evals/src/repeat.ts:75`). `evals/skills/dependency-checker/dependency-checker.cases.ts`

- **2026-10-11** — An eval's planted violation has to match the skill's own
  wording, or the answer key measures the fixture, not the skill: the
  `onion-architecture` eval expected `ExportsRepository.recordExport` (one
  method writing `findingExports` and `findings` inside its own
  `db.transaction`) to be flagged, and both the with-skill and the baseline
  run called it acceptable, because SKILL.md only bans a repository-owned
  transaction "for a multi-repository use case". Plant it as a service that
  calls two repositories where one opens the transaction. Also, recall tied
  8/9 vs 8/9 on the mirrored tree: the skill showed up in fix-match (8/8 vs
  6/8) and in `must_not_flag` hits (1 vs 4), so score those, not recall.
  `.claude/skills/onion-architecture/evals/expected-findings.json`
  **Re-run 2026-10-11** after the fixture was reshaped into a two-repository
  use case: both runs found it (9/9 vs 9/9); fix-match was 9/9 vs 7/9
  (baseline put the transaction in a repository method) and `must_not_flag`
  hits 1 vs 2. The fixture, not the skill, had been the gap.
  **Saturated 2026-10-11** — on a 32-file tree with 15 planted findings, 5
  runs each, v1.0.0 and v1.2.0 both scored 75/75 (every finding 5/5, fix
  5/5), including cross-module imports of `run-executor.ts`, `schemas.ts` and
  an `index.ts` barrel that v1.0.0 never names: its checklist wording
  "another module's internals" was enough. A `tx` omitted inside a
  `db.transaction` callback with an optional-`tx` repository was also 5/5.
  Only the noise moved: `fromContainer` reported in 4/5 v1.0.0 runs vs 0/5
  v1.2.0. To separate versions the fixture needs subtler cases (aliased or
  re-exported imports, a `tx` dropped inside a helper), not more of these.

- **2026-09-18** — `server/src/db/migrations/` cannot be trusted as ground truth for the local dev Postgres's actual schema, so don't `pnpm db:generate` there without checking first: `drizzle.__drizzle_migrations` has 17 applied rows while only 10 `.sql` files (`0000`–`0009`) exist in git, and `\d agent_runs` already shows `cost_usd`/`critical_count`/`warning_count`/`suggestion_count` — columns `server/src/db/schema/runs.ts` declares with no migration file past `0009_complex_runaways.sql` to create them. Most likely cause: commit `c6af1e4` ("revert: restore main to the starter state, homework belongs in forks") reset the migrations folder while the `devdigest_pgdata` volume — deliberately never reset, per this file's own `docker compose down -v` gotcha — kept every schema change 7 now-deleted migrations (ids 11–17) made. Generating a new migration against this drifted state risks a wrong/misleading diff; run `docker exec devdigest-postgres psql -U devdigest -d devdigest -c "\d <table>"` and compare against `schema.ts` before trusting `db:generate`'s output, and treat "columns already exist" as a signal to stop and ask, not to skip the migration.

- **2026-07-29** — Editing `client/src/vendor/shared/` alone silently desyncs the client from the API: it is a hand-copy of the canonical `server/src/vendor/shared/`, there is no sync script, and it already lags in 5 files. Evidence: `diff -rq server/src/vendor/shared client/src/vendor/shared`.

  | File | Missing on the client side |
  |------|----------------------------|
  | `adapters.ts` | `sessionId` on the LLM call; `'openrouter'` in the provider union; `CommitFile` / `CommitFilesPayload` |
  | `contracts/eval-ci.ts` | the whole `AgentManifest` schema; the `Provider` / `CiFailOn` imports |
  | `contracts/knowledge.ts` | `'openrouter'` notes; expanded `CiFailOn` policy comments; the `agent_versions` config-snapshot block |
  | `contracts/productionize.ts` | `'openrouter'` in the provider enum |
  | `contracts/trace.ts` | comment wording only (harmless) |

  Every gap is OpenRouter- or CI-runner-related, so the client cannot currently express an OpenRouter-backed agent even though the API accepts one.

- **2026-07-29** — `.claude/skills/README.md` documents a `.cursor/skills → ../.claude/skills` symlink that does not exist, so Cursor gets no skills here. Evidence: `ls .cursor` → no such directory.

- **2026-08-05** — No package in this repo has ESLint — no config file, no `eslint` dependency, no `lint` script, no lint step in any of the five workflows — so the `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in `client/src` suppress a rule that has never run, and nothing mechanically enforces import direction or hook deps. Evidence: `client/src/lib/hooks/reviews.ts:212`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:39`, `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:56`.
  - **2026-08-05** — Partly stale the same day: `server/` now has `eslint` + `typescript-eslint` and a `lint` script, but still no config file, so `pnpm lint` there fails rather than lints; the suppressed-rule finding above remains true of `client/`. Evidence: `server/package.json:11,45,50`; no `server/eslint.config.*`.
    - **2026-08-05** — Fully resolved for three of four packages: `server/`, `client/` and `reviewer-core/` each now have both a `lint` script and an `eslint.config.mjs`, and `cd server && pnpm lint` exits 0. The configs are **untracked on `refactor/architecture-plan-wave-0-3`**, so lint works locally and is still absent for anyone who has not pulled them; `e2e/` has neither. Evidence: `server/eslint.config.mjs`, `client/eslint.config.mjs`, `reviewer-core/eslint.config.mjs`.

- **2026-08-05** — The skills pipeline is complete on every layer except the one call that feeds it: `run-executor` builds its `reviewPullRequest` input without a `skills` key, so `parts.skills` is always undefined, the `## Skills / rules` section is never emitted and `PromptAssembly.skills` is always null — the trace drawer's skills block is dead UI, not a rendering bug. Evidence: `server/src/modules/reviews/run-executor.ts:189-205` (no `skills:`), `reviewer-core/src/prompt.ts:88-89,109`. **Fixed 2026-09-20** — a completed run now passes `skills: skillBlocks` into `reviewPullRequest` and persists `outcome.assembly`; the drawer renders `prompt_assembly.skills` when non-null. `traceFromBuffer` (failure/cancel) still stores `skills: null`. `server/src/modules/reviews/run-executor.ts:206,286,475`

- **2026-08-05** — `client/messages/en/skills.json` promises a trust model the engine does not implement: four strings tell the user an imported skill is "wrapped as untrusted data" / "delimiter-wrapped", while `assemblePrompt` joins `parts.skills` verbatim into a trusted user section and only `wrapUntrusted()`s the diff/specs/repo-map — so shipping that copy as-is would state a security property the code does not provide. Evidence: `client/messages/en/skills.json:48,52,56,96` vs `reviewer-core/src/prompt.ts:89,109`.

## Codebase Patterns

- **2026-10-04** — Not every `specs/` folder holds specs: `e2e/specs/` is
  the browser-flow suite (`*.flow.json`). A path guard like `*/specs/*` for an
  agent that writes markdown specs or docs lets it write into the e2e suite.
  The `spec-creator` profile denies `e2e/specs/*` explicitly and allows only
  `*.md`; `doc-writer` matched `*/specs/*` and got the same deny the same day.
  `.claude/hooks/agent-guard.sh` (profiles `doc-writer`, `spec-creator`)
- **2026-09-26** — "Latest review per agent" (keep `kind === 'review'`, newest
  per `agentId ?? 'none'`) is implemented three times on purpose, because a
  server module may not import another module's helpers: `pickCountedReviews`
  in `server/src/modules/pulls/helpers.ts`, `pickLatestReviewPerAgent` in
  `server/src/modules/reviews/smart-diff/helpers.ts`, and
  `latestFindingsPerAgent` in `client/src/app/repos/[repoId]/pulls/helpers.ts`.
  Change the rule in one and you must change all three, or list counts, Smart
  Diff dots and inline cards disagree. They already differ on one point: the
  server Smart Diff drops dismissed findings (`finding_lines`), the client
  helper keeps them, so a file with only dismissed findings shows a muted card
  but no dot.
- **2026-08-05** — Pre-staged-for-a-lesson goes well beyond the empty tables `server/INSIGHTS.md` lists: for skills, the DB tables, the `@devdigest/shared` contracts, the `## Skills / rules` prompt section, the trace-drawer block + its colour token, and the entire `messages/en/skills.json` i18n namespace all ship in the starter with no module and no screen behind them — search for existing scaffolding before writing any of it. Evidence: `server/src/vendor/shared/contracts/knowledge.ts:114-141`, `reviewer-core/src/prompt.ts:109`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/constants.ts:16`, `client/messages/en/skills.json`.

  - **2026-08-05** — Conventions was staged even further than skills — table, `ConventionCandidate` contract, `FEATURE_MODELS.conventions`, `repoIntel.getConventionSamples()`, the whole `messages/en/conventions.json` namespace, `activeKeyFor("/conventions")` AND the mock adapter's schema names all shipped with no module, so the build was assembly, not authoring. Evidence: `server/src/modules/repo-intel/service.ts:630`, `client/src/components/app-shell/helpers.ts:31`, `docs/specs/conventions.md` §2.

- **2026-08-05** — `POST /agents/:id/skills` is two endpoints in one body schema and picking the wrong shape silently destroys data: `{skills:[…]}` / `{skill_ids:[…]}` REPLACE the agent's whole ordered set (that is what `useSetAgentSkills` sends), while `{skill_id}` appends — so "also give this agent the new skill" must use the single-id form or the agent's other skills vanish. Evidence: `server/src/modules/agents/routes.ts:170-180`, `client/src/lib/hooks/skills.ts` (`useLinkAgentSkill` vs `useSetAgentSkills`).

- **2026-07-29** — `.gitignore` carries un-ignore rules for an `agent-runner/dist/` that does not exist yet; they are pre-staged for the Export-to-CI lesson (L06), not leftovers to clean up. Evidence: `.gitignore:3-6`, `reviewer-core/README.md:7-9`.

## Tool & Library Notes

- **2026-10-11** — The first real run of `.github/workflows/evals.yml` failed
  three ways that no local check shows, so lint it with `actionlint` and keep
  the preflight step: (1) `${{ env.X }}` inside a job-level `env:` is rejected
  (`Unrecognized named-value: 'env'`) — use `inputs`/`vars`/`secrets` there;
  (2) `ghcr.io/berriai/litellm:main-stable` now exits with
  `UnsafeMasterKeyError` unless `LITELLM_MASTER_KEY` or
  `LITELLM_DANGEROUSLY_PERMIT_WEAK_OR_UNSET_MASTER_KEY=true` is set (floating
  tag — it broke with no change of ours); (3) a secret holding only the 64-hex
  part of the key (`key length=64`, no `sk-or-v1-`) gives `401 Missing
  Authentication header`, indistinguishable from "no key" at the call site.
  `evals/proxy/docker-compose.yml`, `.github/workflows/evals.yml`

- **2026-10-11** — In the Agent SDK, `allowedTools` does not restrict
  anything under `permissionMode: "bypassPermissions"` — it only auto-approves,
  so a "read-only allow-list" still had `Bash`/`Write`. The `tools` option is
  the hard cap, and `runClaude` now takes it (`workflowTask` passes the
  allow-list as `tools`). It caps built-ins only: MCP connectors stay callable
  and a run still called `mcp__claude_ai_Claude_Docs__update`, so the
  `expectReadOnly` check (Bash/Write/Edit/NotebookEdit) does not catch it.
  **Fixed 2026-10-11** — a hard-capped run also passes `strictMcpConfig: true`
  and `disallowedTools: ["mcp__*"]`, and `expectReadOnly` flags any `mcp__*`
  call; the same activation case now traces `Skill, Read, Grep` only.
  `evals/src/runtime/run-claude.ts`, `evals/src/dsl/case.ts`

- **2026-10-11** — skill-creator's `scripts.aggregate_benchmark` reads only
  `<iteration>/eval-*/<config>/run-N/grading.json`: a config folder with no
  `run-*` subfolder is skipped silently, so the summary comes out empty. It
  also takes tokens from `timing.json` only when `grading.json` has no
  `timing.total_duration_seconds`; with it present the token column is `0`.
  Keep outputs under `run-1/` and leave `timing` out of `grading.json`. Run
  it from the skill-creator directory:
  `python3 -m scripts.aggregate_benchmark <iteration-dir> --skill-name <name>`.
  `~/.claude/plugins/cache/claude-plugins-official/skill-creator/*/skills/skill-creator/scripts/aggregate_benchmark.py:80-135`

- **2026-10-04** — For agent-facing test runs, raw `pnpm test` output is the
  token sink, not test time (all four packages run in ~15 s). A blind
  `tail -n 12` is no fix: vitest prints the `Failed Tests` block *above* the
  summary, so the tail kept the counts and dropped the assertion, and the
  agent re-ran the raw suite to see it (this is what `check-all.sh` did until
  today). What works: `vitest related --run --reporter=dot --silent
  --passWithNoTests <files>` with `NO_COLOR=1`, then print from the
  `Failed Tests` line on. `related` accepts a test file as well as source
  files, and in `server/` it needs `--exclude '**/*.it.test.ts'` like `run`.
  `scripts/check-pkg.sh`

- **2026-09-25** — A `tools` allowlist does not make a subagent read-only
  while it has `Bash`: `> file`, `tee` and `sed -i` still write, and
  `permissionMode: plan` does not close that gap. `architecture-reviewer`
  is read-only only because it has no Bash; `test-writer`, `plan-verifier`
  and `doc-writer` are fenced by inline `PreToolUse` hooks that run
  `.claude/hooks/agent-guard.sh <profile>` (exit 2 blocks). Test the script
  with synthetic input: `printf '%s' '{"tool_name":"Write","tool_input":
  {"file_path":"'$PWD'/server/src/x.ts"}}' | CLAUDE_PROJECT_DIR=$PWD
  .claude/hooks/agent-guard.sh test-writer; echo $?` prints `2`.
  `implementation-planner` (formerly `planner`) and `researcher` still rely
  on their prompt alone, by choice (2026-10-04).
  `.claude/hooks/agent-guard.sh`

- **2026-09-25** — An agent file added to `.claude/agents/` is not callable in
  the session that created it: `Agent` with `subagent_type: "researcher"`
  fails with `Agent type 'researcher' not found. Available agents: claude,
  claude-code-guide, Explore, general-purpose, Plan, statusline-setup`.
  Restart Claude Code, then check `/agents`; until then, delegate to
  `general-purpose` with a prompt that says to read the agent file first.
  `.claude/agents/researcher.md`

- **2026-09-25** — Subagents can spawn subagents by default (up to three
  layers below the main conversation), so "single-level" is not automatic:
  omit `Agent` from the agent's `tools` list (or set
  `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`). `implementation-planner`, `implementer` and
  `researcher` all rely on the omission. Source:
  https://code.claude.com/docs/en/sub-agents (read through a summarizing
  fetch, so verify before quoting). `.claude/agents/implementation-planner.md:5`

- **2026-07-29** — Half this repo is pnpm and half is npm, so running `pnpm install` in `reviewer-core/` or `e2e/` would create a second competing lockfile — match the lockfile already in the directory, not the root README's pnpm prerequisite.

  | Package | Lockfile |
  |---------|----------|
  | `server/`, `client/` | `pnpm-lock.yaml` |
  | `reviewer-core/`, `e2e/` | `package-lock.json` |

- **2026-07-29** — `skills-lock.json` disagrees with `.claude/skills/` in both directions, so it cannot be read as an index of available skills; read the directory. Evidence: lock-only — `architecture-patterns`, `github-workflow-automation`; disk-only — `mermaid-diagram`, `react-best-practices`, `react-testing-library`, `security`.

## Recurring Errors & Fixes

## Session Notes

- **2026-07-29** — Wrote per-module `CLAUDE.md` files and swept the repo for drift while doing it; every entry here and in the per-module files came from that sweep. The `engineering-insights` skill was built in the same session.
- **2026-07-29** — Run Cost Badge lab re-added per-run cost (`agent_runs.cost_usd`, migration 0010) that commit `d45ab0d` had deliberately removed — the removal only disconnected persistence/UI, `reviewer-core` kept computing `ReviewOutcome.costUsd` the whole time, so the re-add was a one-field reconnect. Evidence: `reviewer-core/src/review/run.ts:216`.
- **2026-08-04** — `.claude/skills/react-frontend-architecture/` deliberately holds only `SOURCES.md` (curated research for a skill not yet written) — the missing `SKILL.md` is pending work, not a broken skill to clean up. Evidence: `.claude/skills/react-frontend-architecture/SOURCES.md:1-15`.
  - **2026-08-04** — `.claude/skills/onion-architecture/` now follows the same pattern: `SOURCES.md` holds the verified research plus the SKILL.md plan (§12) for the backend layering skill. Evidence: `.claude/skills/onion-architecture/SOURCES.md:1-10`.
    - **2026-08-05** — Resolved: the skill is written (`SKILL.md` v1.0.0 + `README.md` sources) and listed in the catalog; unlike the frontend skill, `SOURCES.md` was **kept** — it carries the per-tool layer map (§13) and the live-code drift the rules were written against (§14). Evidence: `.claude/skills/onion-architecture/SKILL.md:1-6`, `.claude/skills/README.md:9`.
  - **2026-08-04** — Resolved same day: renamed to `.claude/skills/frontend-ui-architecture/` and the skill was written (`SKILL.md` v1.0.0 + `README.md` sources); `SOURCES.md` was absorbed into those two files and deleted. Evidence: `.claude/skills/frontend-ui-architecture/SKILL.md:1-6`.
- **2026-08-05** — Second research pass on `.claude/skills/onion-architecture/SOURCES.md`: mapped every backend dependency to an onion layer and added the five areas the first pass missed (LLM SDKs as an ACL, jobs/queues, the SSE run bus, config/secrets, mechanical enforcement); the SKILL.md plan is now §15, and §12 carries a superseded banner.
- **2026-08-05** — Repo-wide architecture read against `frontend-ui-architecture`, the `onion-architecture` SOURCES research, and the React/Next/Fastify/Postgres skills; analysis only, no code changed. Findings landed as entries in this file and in `client` / `server` / `reviewer-core`.
- **2026-08-05** — Acted on that audit: mechanical enforcement (ESLint in all three packages, `dependency-cruiser` layer rules + `pnpm arch`, CI lint steps), the `pulls`/`settings` module promotions with `polling`/`workspace` moved onto shared container repositories, DB indexes + enum CHECK constraints (migrations 0011/0012), and the client's missing error boundaries. Still open from the same audit: no route declares `schema.response`, nothing runs in a transaction, and `client/src/vendor/shared/` still lags the canonical copy.

- **2026-08-05** — Spec for the Skills feature (storage, editor, agent binding, `.md`/`.zip` import, seeded Test Quality + API Contract reviewers) written to `docs/specs/skills.md`; investigation only, no code changed. The four entries above came from that read.
  - **2026-08-05** — Then implemented in full the same session: `modules/skills/`, `agent_skills.enabled` (migration 0013), the `/skills` page + agent Skills tab, `fflate`-based `.zip` import, and the `run-executor` wiring that finally makes the prompt block non-empty. The two entries under *What Doesn't Work* above are resolved by it; the trust-copy one was fixed by rewriting `client/messages/en/skills.json`.

- **2026-08-05** — Built the Conventions Extractor (spec + roadmap in `docs/specs/conventions.md`): `modules/conventions/`, migration 0015, the `/repos/[repoId]/conventions` page and the skill-draft modal. The design premise — a model proposes, code samples and code verifies — is the same grounding-gate shape `reviewer-core` already uses for findings.

## Open Questions

- **2026-10-11** — Is `Service.fromContainer(container)` called inside
  `routes.ts` a layering violation? Real modules do exactly this
  (`BriefService.fromContainer(container)`), yet runs both with and without the
  `onion-architecture` skill flagged it as a service locator and "route builds
  its own service", so either SKILL.md needs a sentence blessing the pattern
  or the repo should change. Decide, then state it under "Rules by tool →
  Fastify" and remove the note from the eval's Known gaps.
  `server/src/modules/brief/routes.ts:15`,
  `.claude/skills/onion-architecture/evals/eval.md`
  **Fixed 2026-10-11** — `SKILL.md` v1.1.0 blesses `fromContainer` in
  `routes.ts` and still flags `new Repository()` in a handler or service.
  `.claude/skills/onion-architecture/SKILL.md:82-86`
  **Measured 2026-10-11** (v1.0.0 vs v1.1.0, same tree, 2 runs each): recall
  and fix-match tied 9/9, but v1.0.0 flagged the `fromContainer` factory in
  both runs and v1.1.0 called it "the sanctioned pattern" in both. Residual:
  v1.1.0 still reports "the service holds the whole `Container`" — the rule
  covers the factory, not the injected `Container`.

- **2026-09-25** — Do inline `hooks:` in a subagent's frontmatter really
  fire and block for `test-writer`, `plan-verifier` and `doc-writer`?
  `agent-guard.sh` is verified only against synthetic hook JSON, not inside
  a running subagent. After a restart, ask `test-writer` to write a file
  under `server/src/`; it must be refused with `agent-guard(test-writer)`.
  If it is not, move the hooks to `.claude/settings.json` with a matcher.
  `.claude/agents/test-writer.md:11-17`

- **2026-09-25** — Does `skills:` in agent frontmatter really preload
  `onion-architecture` and `frontend-ui-architecture` for `implementation-planner` and
  `implementer`? The rule comes from the subagent docs, not from a run in
  this repo. After a restart, delegate one step from
  `docs/improvement-plan.md` and check that the report cites layering rules;
  if it does not, move the skills into the delegation prompt.
  `.claude/agents/implementer.md:6-8`
  - **2026-10-04** — Now matters more: both agents preload only the core
    (`onion-architecture`, `frontend-ui-architecture`, `engineering-insights`)
    and load domain skills through `Skill` on demand. Also check that the
    implementer report's "Skills applied" lists the on-demand ones the plan
    named. `.claude/agents/implementer.md:7-10`

- **2026-08-05** — Is `repoIntel.getConventionSamples()` filtering tests out right for this feature? It reuses the review-context rank filter (`isJunkPath` drops `.test.`/`.spec.`), so testing conventions — some of the most useful house rules — are structurally invisible to the extractor. Evidence: `server/src/modules/repo-intel/service.ts:629-630,709-728`.
  **Fixed 2026-09-20** — `isJunkPath` is unchanged; extract adds
  `getConventionTestSamples(repoId, 4)`.
  `server/src/modules/repo-intel/helpers.ts`,
  `server/src/modules/conventions/service.ts`.

- **2026-07-29** — Is the client's vendored `@devdigest/shared` copy meant to be synced by a manual step someone knows about, or was it simply forgotten? Nothing in `scripts/` or CI touches it, and the drift is one-directional.
- **2026-07-29** — Are `architecture-patterns` and `github-workflow-automation` in `skills-lock.json` planned additions or removed skills whose lock entries were never cleaned?
