# Implementation Plan: Skill evals — skill-owned cases and suite runs (server + contracts)

Spec: `specs/2026-10-17-skill-evals-server.md` (G1, approved 2026-10-17) · Mode: single (one implementer, sequential) · Packages: server (incl. `@devdigest/shared`), client (vendor copy + test fixtures only)

Planner output saved by the main session. OQ-1 (copying the same agent case twice): default "allow", copies are independent, no duplicate check.

## Assumptions (plan-only; none changes the spec)

- **A1 Indexes.** Replace `eval_suite_runs_agent_running_uq` with two partial unique indexes: `eval_suite_runs_agent_owner_running_uq` on `(agent_id) WHERE status='running' AND owner_kind='agent'` and `eval_suite_runs_skill_running_uq` on `(skill_id) WHERE status='running' AND owner_kind='skill'`. Add history index `eval_suite_runs_skill_ran_at_idx` on `(skill_id, ran_at)`. Two CHECKs: `eval_suite_runs_owner_kind_check` (`owner_kind IN ('agent','skill')`) and `eval_suite_runs_owner_shape_check` (`(owner_kind='agent' AND skill_id IS NULL AND skill_version IS NULL) OR (owner_kind='skill' AND skill_id IS NOT NULL AND skill_version IS NOT NULL)`). Existing rows get `owner_kind='agent'` from the column default.
- **A2 Finding dry-run body.** `POST /findings/:id/eval-case/dry-run` keeps Spec C's body: its route schema becomes `EvalDryRunRequest.omit({ agent_id: true })` (strict), so `agent_id` there is `422 validation_error`; add a regression assertion.
- **A3 Ids.** `case_id` and `agent_id` in new/changed request schemas are `z.string().uuid()` (malformed id = `422 validation_error`, never a DB 500).
- **A4 R-G2 run refusal order** (all before `llmSingleShot`, 0 model calls): case `404`; agent-owned case: `agent_id` given → `422 host_not_allowed`, then owner agent missing → `404` (baseline); skill-owned case: skill missing → `404 not_found`, no `agent_id` → `422 host_required`, host not in workspace → `422 host_not_found`; then `file_not_in_diff`.
- **A5 R-G1 order.** Manual: skill `404` → `invalid_diff` → in tx `409 eval_run_in_progress` → `422 too_many_cases`. Copy: skill `404` → source `404` → `not_agent_case` → in tx `409` → `too_many_cases`.
- **A6** `PATCH`/`DELETE` of a case whose skill was deleted and `GET /eval-runs/:id` of a deleted skill's suite keep today's behaviour (no owner-existence check). Only run has a 404 (R-G2).
- **A7** `findCaseBySourceFinding` stays `owner_kind='agent'` (a skill copy with the same `source.finding_id` must not block "Turn into eval case").
- **A8** Advisory lock keys `eval-<kind>:<id>`; the agent key stays `eval-agent:<id>`.
- **A9** AC-13 test: after testcontainer migrations insert a suite with raw SQL omitting the three new columns and read it through the API; a real pre-0016 DB is checked by hand in T5 step 8.
- **A10** Skill manual case reuses the agent path's diff build/validation through one private service method; `input_meta` = `{ pr_number: 0, pr_title: name, pr_body: null, repo: 'manual' }`.
- **A11** Client test fixtures get `owner_kind: 'agent', skill_id: null, skill_version: null` (and `skill_version: null` on dry-run results); only the files `pnpm typecheck` flags. No client behaviour change.
- **A12** `skillsRepo.getById` / `agentsRepo.getById` do not filter on `enabled` (needed for AC-9).

## Architecture constraints

- Everything stays in `server/src/modules/eval/`. `routes.ts` = transport only (validate → one service method → serialize), `schema.response` on every route, bodies from `@devdigest/shared`. Only `repository.ts` imports `drizzle-orm`/`db/schema`. Pure rules in `helpers.ts`.
- Skills via `container.skillsRepo`, agents via `container.agentsRepo`, injected as narrow lookup interfaces in `EvalServiceDeps`. Never import `skills/*` or `agents/*` internals.
- Multi-step writes in a service-owned `repo.transaction`; every repository call inside gets `tx`.
- A skill suite / skill per-case run never calls `enabledSkillsForPrompt`: its `skills` input is exactly `[evalSkillBlock(skill)]`. `runCase` and the guarded provider are unchanged (`maxRetries: 0`, `maxTokens` 8192, 120 s).
- No `agent_runs`, `run_traces`, run bus (NG-9). Reaper unchanged (already owner-agnostic).
- Do not touch: `reviewer-core/**`, `server/src/platform/{prompt,grounding,structured}.ts`, migrations `0000`–`0015`, lockfiles, `server/clones/**`, client components/hooks/i18n (G2/G3).

## Contract changes (`@devdigest/shared`, server copy first, client copy byte-identical)

- `contracts/knowledge.ts`: new `EvalCaseCopyRequest = { case_id: uuid }.strict()`.
- `contracts/eval-ci.ts`: new `EvalSuiteStartRequest = { agent_id: uuid }.strict()`; `EvalDryRunRequest` gains optional `agent_id` (uuid); `EvalDryRunResult` gains `skill_version` (int, nullable); `EvalSuiteRun` gains `owner_kind: EvalOwnerKind`, `skill_id` (string, nullable), `skill_version` (int, nullable) (flows into `EvalSuiteRunDetail`, `EvalRecentRun`, `EvalDashboardRow.latest`). Fix doc comments saying "every case of an agent".
- Parity test: `server/test/eval-contracts.test.ts:512-529`.

## Tasks (order: T0 → T16)

Per-task check: `scripts/check-pkg.sh <pkg> <files>`; it-tests: `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run <file>`.

- [ ] **T0** Baseline `scripts/check-all.sh`; read-only DB check `docker exec devdigest-postgres psql -U devdigest -d devdigest -c "\d eval_suite_runs"` and migration count (`select count(*) from drizzle.__drizzle_migrations` vs 16 `.sql` files). If `owner_kind`/`skill_id` already exist on the dev DB: STOP and ask. Confirm `git status server/src/db/migrations` is clean.
- [ ] **T1** Shared contracts (server copy): `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`. Field names exactly as the spec (G2 depends on them).
- [ ] **T2** `server/test/eval-contracts.test.ts`: update fixtures; new cases: `EvalCaseCopyRequest`/`EvalSuiteStartRequest` reject unknown keys and missing/non-uuid id; `EvalDryRunRequest` accepts `{}`, `{agent_id}`, `{expected_output, agent_id}`; `EvalSuiteRun` requires `owner_kind` and accepts null `skill_id`/`skill_version`; the `.omit({agent_id:true})` variant rejects `agent_id`.
- [ ] **T3** Client: copy both contract files whole into `client/src/vendor/shared/contracts/` (`diff -q` empty); `cd client && pnpm typecheck`; add the A11 fields to exactly the flagged test fixtures. No behaviour change.
- [ ] **T4** Drizzle schema `server/src/db/schema/eval.ts` per A1: `ownerKind: text('owner_kind', { enum: ['agent','skill'] }).notNull().default('agent')`, `skillId: uuid('skill_id')` (no FK), `skillVersion: integer('skill_version')`; replace the `uniqueIndex`, add the new index and both `check()`s; update the table doc comment.
- [ ] **T5** Migration `0016_*` via `pnpm db:generate` (never hand-written): (1) generate (no rename prompt expected; if one appears STOP); (2) `git diff src/db/migrations/meta/_journal.json` = exactly one appended entry; (3) generated SQL touches only `eval_suite_runs` (else drift: STOP); (4) hand-edit per NFR-5: `ADD COLUMN IF NOT EXISTS` (owner_kind `text DEFAULT 'agent' NOT NULL`, skill_id, skill_version), `DROP INDEX IF EXISTS "eval_suite_runs_agent_running_uq"`, `CREATE [UNIQUE] INDEX IF NOT EXISTS` for the three new indexes, each `ADD CONSTRAINT … CHECK` wrapped in `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$;`; (5) leave snapshot JSON as generated; (6) `pnpm db:migrate` → "✓ migrations applied" (announce before running: it touches the local dev DB); (7) `pnpm db:generate` again → no schema changes; (8) `\d eval_suite_runs` matches schema and `select owner_kind, count(*) from eval_suite_runs group by 1` shows only `agent`.
- [ ] **T6** `types.ts`: `EvalOwner = { kind: 'agent'|'skill'; id: string }`. `helpers.ts`: `toEvalSuiteRun` maps `owner_kind`, `skill_id`, `skill_version` (`?? null`); `toDryRunResult(..., agentVersion, skillVersion: number|null)`; `suiteLogLine(id, s, skillId?)` renders `eval suite <id> (skill <skill_id>): …` when given (agent format unchanged); new pure `hostRefusal(ownerKind, agentIdGiven)` → `'host_required'|'host_not_allowed'|null`; new `singleRunLogLine(caseId, outcome, costUsd, skillId?)`. Tests: `server/test/eval-helpers.test.ts`, `eval-draft-helpers.test.ts`.
- [ ] **T7** `repository.ts`: `lockAgent` → `lockOwner(tx, owner)`; `NewCase.agentId` → `owner: EvalOwner`; `listCasesByAgent` → `listCasesByOwner(ws, owner, tx?)` (name, id order); `getRunningSuite(ws, owner, tx?)`; `NewSuiteRun` gains `ownerKind`, `skillId`, `skillVersion`; `insertSuiteRun` picks `onConflictDoNothing` target and `where` per owner with a predicate equal to the matching partial index (incl. `owner_kind`, else Postgres cannot infer the arbiter); new `listSuitesBySkill(ws, skillId, limit)` (`owner_kind='skill'`, newest first, tie-break id); add `owner_kind='agent'` to `listSuitesByAgent`, `listRecentFinishedSuites` and the `ranked`/`runningRows` queries of `dashboardInputs` (AC-12); `findCaseBySourceFinding` stays agent-only (A7).
- [ ] **T8** `service.ts`: add `SkillLookup { getById(ws,id) → {id,name,body,source,version}|undefined }` to `EvalServiceDeps`, bound to `container.skillsRepo` in `fromContainer`. Owner-aware baseline: `deleteCase`/`updateCase` lock and check the case's own `(owner_kind, owner_id)` (AC-5; message "An eval run of this agent/skill is in progress"); `runSingleCase` follows A4 (skill case uses host prompt/provider/model/version with skills `[evalSkillBlock(skill)]`; result `skill_version` = skill's current version, agent case `null`; log through `req.log`: `{case_id, skill_id?, agent_id, outcome, cost_usd}` + `singleRunLogLine`). Shared private `insertManualCase(ws, owner, body)` (A10). New: `listSkillCases` (404 unknown/foreign), `createSkillManualCase`, `copyCaseToSkill` (A5; copies name, input_diff, input_files, input_meta, expected_output incl. source, notes; source row never written), `startSkillSuite(ws, skillId, agentId, log)` (skill 404 → host `422 host_not_found` → tx: lockOwner skill, running → 409, `no_cases`, `too_many_cases` → insert with owner_kind 'skill', skill_id, skill_version, host agent_id/agent_version, case_ids in name order, `skills: [skill.name]`; insert returning null → 409; executor job: host config + `skillBlocks: [evalSkillBlock(skill)]`; no `enabled` checks on skill, host or link), `listSkillSuites` (404 unknown/foreign; ≤ `EVAL_HISTORY_LIMIT`). `dryRunCase` (finding) passes `skill_version: null`.
- [ ] **T9** `suite-executor.ts`: when `suite.ownerKind === 'skill'` call `suiteLogLine(id, final, suite.skillId)` and add `skill_id` to the structured fields; `agent_id` stays the host.
- [ ] **T10** `server/test/eval-dry-run.test.ts`, `eval-reaper.test.ts`: add a `skills` stub to `new EvalService({...})` deps; repo mock method names follow T7.
- [ ] **T11** `routes.ts` (+ header comment): `GET /skills/:id/eval-cases` → 200 `EvalCase[]`; `POST /skills/:id/eval-cases` body `EvalCaseManualCreate`, 201, `bodyLimit: EVAL_MANUAL_BODY_LIMIT_BYTES`, rate limit 30; `POST /skills/:id/eval-cases/copy` body `EvalCaseCopyRequest`, 201, `bodyLimit: EVAL_BODY_LIMIT_BYTES`, rate limit 30; `POST /skills/:id/eval-runs` body `EvalSuiteStartRequest`, 202 `EvalSuiteRun`, rate limit `EVAL_RUN_RATE_LIMIT` (5), passes `req.log`; `GET /skills/:id/eval-runs` → 200 `EvalSuiteRun[]`; `POST /eval-cases/:id/run` body stays `EvalDryRunRequest.nullish()` (now carries `agent_id`); `POST /findings/:id/eval-case/dry-run` body → `EvalDryRunRequest.omit({ agent_id: true }).nullish()` (A2). All use `IdParams` and declare `schema.response`.
- [ ] **T12** `server/test/helpers/eval-fixtures.ts`: add `makeSkill({ws?, name?, body?, source?, enabled?, version?})` and `linkSkill(agentId, skillId, {enabled?})` (additive only).
- [ ] **T13** `server/test/eval-skill-cases.it.test.ts`: AC-1 (skill with 2 cases, agent with 3: skill list 2 sorted by name, agent list 3, foreign/unknown skill 404); AC-2 (201 body + stored row: owner_kind 'skill', owner_id, `source: null`, input_diff with `diff --git`/`---`/`+++` headers, stub input_meta); AC-3 (copy: six fields compare, source case and agent list unchanged, copying twice gives two rows); AC-4 (one case per R-G1 row with `eval_cases` count check: foreign skill, foreign/unknown source, source is a skill case → `not_agent_case`, no `@@` → `invalid_diff`, 100 cases → `too_many_cases`, running skill suite → 409); AC-5 (running skill suite → 409 for PATCH and DELETE of a skill case; running suite of the host agent leaves skill-case PATCH/DELETE 200; running agent suite still blocks that agent's case; a skill suite hosted by that agent does not block the agent's case); A2 regression (finding dry-run with `agent_id` → 422); NFR-3 (foreign `skill_id`/`case_id` 404, unknown key 422, 31st copy in a minute 429 using `NODE_ENV: 'development'`, manual body over 256 KB 413). Every app overrides all three LLM providers.
- [ ] **T14** `server/test/eval-skill-runs.it.test.ts` (scripted `MockLLMProvider`, all three providers overridden): AC-6 (skill case + host → 200, mock call count 1, `agent_version` = host's, `skill_version` = skill's, row counts of `eval_runs`/`eval_suite_runs`/`agent_runs`/`run_traces` unchanged; agent case without `agent_id` → own agent, `skill_version: null`); AC-7 (one case per R-G2 row; call count stays 0); AC-8 (host linked to 2 other enabled skills + the skill under test; captured request of a suite case and a per-case run each has exactly one `### <name>` block, diff equals `input_diff`, excluded headings absent, `community` skill keeps `> Third-party skill` line); AC-9 (202 fields; still 202 with disabled skill/host/unlinked host; after a skill body edit the next suite's `skill_version` is +1); AC-10 (each R-G3 row; two concurrent starts → one 202 and one 409; suite count checked); AC-11 (both orders answer 202; two `running` rows coexist); AC-12 (finished agent suite + finished skill suite hosted by that agent: `GET /agents/:id/eval-runs` 1 row, dashboard `latest` is the agent suite and `running` false while only a skill suite runs, recent-runs 1 row, `GET /skills/:id/eval-runs` has the skill suite newest first, ≤ 50, that skill only; foreign skill 404); AC-13 (raw-SQL agent suite without the three columns reads back with `owner_kind 'agent'`, skill fields null); NFR-1 (call count = `cases_total`, captured `maxRetries: 0`, costs stored); NFR-2 (running skill suite at boot becomes `failed`/`interrupted`, case rows kept); NFR-3 (6th `POST /skills/:id/eval-runs` in a minute → 429); NFR-4 (log capture via `app.log.child`: suite line `eval suite <id> (skill <skill_id>): …`, per-case line fields).
- [ ] **T15** Run existing agent it-tests unchanged (`eval-{cases,runs,history,recent-runs,case-modal}.it.test.ts`); edit only for mechanical fallout of T7 renames. `cd server && pnpm verify:l06`.
- [ ] **T16** Docs: `server/docs/eval.md` (routes table with the 5 new routes and the changed run body/refusals, owners, skill-suite prompt, one running suite per owner with the new index names, dashboard/recent/history exclusion, log line, pointer to G1); `server/README.md` API map. (Main session applies README edits: the doc-writer guard blocks them.)

## Test plan

- Per task: `scripts/check-pkg.sh <pkg> <files>`.
- End: `cd server && pnpm typecheck && pnpm verify:l06` (globs `test/eval-`; fails without Docker by design); `scripts/check-pkg.sh server`; `scripts/check-pkg.sh client` and once `cd client && pnpm build` after T3 (stop `next dev` first, or skip build). Main session also runs `scripts/check-all.sh` at T0 and the end.
- `pnpm typecheck` does not cover `test/**`; vitest is the only check on test files.

## Coverage matrix

| AC | Tasks | Tests |
|---|---|---|
| AC-1 | T7, T8, T11 | eval-skill-cases (AC-1) |
| AC-2 | T1, T8, T11 | eval-skill-cases (AC-2) |
| AC-3 | T1, T8, T11 | eval-skill-cases (AC-3); eval-contracts |
| AC-4 | T7, T8 | eval-skill-cases (AC-4) |
| AC-5 | T7, T8 | eval-skill-cases (AC-5) |
| AC-6 | T1, T6, T8, T11 | eval-skill-runs (AC-6); eval-draft-helpers |
| AC-7 | T6, T8 | eval-skill-runs (AC-7); eval-helpers (`hostRefusal`) |
| AC-8 | T8 | eval-skill-runs (AC-8) |
| AC-9 | T1, T4–T8, T11 | eval-skill-runs (AC-9); eval-helpers (mapping) |
| AC-10 | T4, T5, T7, T8 | eval-skill-runs (AC-10) |
| AC-11 | T4, T5, T7 | eval-skill-runs (AC-11); eval-runs.it |
| AC-12 | T7, T8, T11 | eval-skill-runs (AC-12); eval-history.it, eval-recent-runs.it |
| AC-13 | T4, T5, T6 | eval-skill-runs (AC-13); T5 step 8 (manual) |
| NFR-1 | T8 | eval-skill-runs (NFR-1) |
| NFR-2 | — (reaper owner-agnostic) | eval-skill-runs (NFR-2) |
| NFR-3 | T11 | eval-skill-cases, eval-skill-runs (NFR-3) |
| NFR-4 | T6, T8, T9 | eval-skill-runs (NFR-4); eval-helpers |
| NFR-5 | T0, T4, T5 | manual T5 steps 6–8 |
| NFR-6 | T13, T14 | `pnpm verify:l06` with and without Docker |

## Risks and traps

- R1 Dev DB drift / shared dev DB: `db:generate` never emits `IF NOT EXISTS`; use `IF NOT EXISTS` and `DO $$ … duplicate_object` wrappers; T0 stops if columns already exist.
- R2 Journal rewrite after generate: exactly one appended entry.
- R3 Generate is not apply: it-tests pass on a fresh container while the dev DB fails until `pnpm db:migrate`.
- R4 `ON CONFLICT` arbiter inference: the conflict `where` must repeat the full partial-index predicate incl. `owner_kind`; the agent index must exclude skill rows (AC-11).
- R5 Client typecheck fallout in ~20 test fixtures (T3).
- R6 Shared body schema: widening `EvalDryRunRequest` would accept `agent_id` on the finding dry-run (A2).
- R7 Paid calls in tests: override `openai`, `anthropic`, `openrouter` in every new app, also the rate-limit apps (`NODE_ENV: 'development'`).
- R8 "One call" is asserted on the captured request (`maxRetries: 0`), not just the count.
- R9 Never call `enabledSkillsForPrompt` on the skill path (would duplicate the skill's block).
- R10 Finding de-dup stays agent-only (A7).
- R11 `skill_version` bumps only on a body change; host skill links do not affect a skill suite.
- R12 Reasoning models error most cases; any paid demonstration must be announced to the user and use `deepseek/deepseek-chat-v3.1`.

## Handoff

- For `architecture-reviewer`: no `drizzle-orm` in `service.ts`/`routes.ts`/`helpers.ts`; skills only through `container.skillsRepo`; every write in the case/suite transactions gets `tx`; `schema.response` on all 5 new routes.
- Security (no agent): workspace scoping of `case_id`/`agent_id`/skill id (foreign → 404 / `422 host_not_found`); strict bodies; rate limits and body limits on new POSTs; skill body stays in the trusted prompt section as today (root INSIGHTS 2026-08-05).
- INSIGHTS candidates after implementation: a partial unique index used as an `ON CONFLICT` arbiter needs its full predicate in the conflict `where`; per-case routes treated `eval_cases.owner_id` as an agent id without checking `owner_kind`.
