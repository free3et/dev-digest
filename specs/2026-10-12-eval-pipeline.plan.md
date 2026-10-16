# Requirements review: Eval cases and scoring (A) and Eval run history, compare and dashboard (B)

Specs:
- A: `/Users/oleksandra/dev-digest/specs/2026-10-12-eval-cases-and-scoring.md` · SPEC-2026-10-12-eval-cases-and-scoring · approved
- B: `/Users/oleksandra/dev-digest/specs/2026-10-12-eval-run-history-compare.md` · SPEC-2026-10-12-eval-run-history-compare · approved

Index: `specs/eval-pipeline.md`. It holds no requirements.

**Pass 1 result: nothing blocks.** Both specs pass every item of the §11 checklist. Every AC has a Source and a Verify, Traceability is closed, no `[NEEDS CLARIFICATION]` is left (OQ-1 was resolved by C-22), and both specs are approved. The non-blocking notes below have defaults, and the plan uses them.

## Non-blocking notes (pass 1)

- **N1. The 60 s timeout and "exactly one call" (A-AC-10) are not reachable through reviewer-core as it stands, and reviewer-core must not change.**
  - `reviewPullRequest` sends only `maxRetries` and `sessionId` to `completeStructured`. It does not send `timeoutMs` or `maxTokens` (`reviewer-core/src/review/run.ts:186-193`).
  - `OpenRouterProvider` ignores `req.timeoutMs`. Its OpenAI SDK client also retries at the HTTP level by default (`maxRetries: 2`, `timeout: 90_000`, `reviewer-core/src/llm/openrouter.ts:51-56`).
  - The container builds it with no options (`server/src/platform/container.ts:204-213`).
  - Plan (T12, T13): the container gets a new single-shot provider built with the constructor options that already exist (`maxRetries: 0`, `timeoutMs: 60_000`). An eval-side wrapper adds `maxRetries: 0`, `maxTokens` and `timeoutMs` to every request and races a 60 s timer.
  - What is left: the `openai` and `anthropic` adapters still retry transient errors through `withRetry` and their SDK defaults (`server/src/adapters/llm/openai.ts:52,97`). A-AC-10 is checked at the request level, as its Verify hint says. Seeded agents and the experiment use `openrouter`. This goes under Risks. A later spec or port change (an abort `signal` on `StructuredRequest`) would close it.
- **N2. A `finish_reason=length` cut-off cannot be told apart from a schema failure** without touching reviewer-core. The provider throws `OpenRouter structured output failed schema validation for Review` with no raw body. Plan (T13): that error becomes a case `error` whose text names the possible truncation and the `max_tokens` value.
- **N3. Per-case `outcome`, `matched`, `expectation_kind`, `findings_kept/dropped` and `error` are stored inside `eval_runs.actual_output` (jsonb)** next to `kept` and `dropped`, and mapped to `EvalRunRecord` in helpers. The spec lists only `eval_suite_runs` and `eval_runs.suite_run_id` as DB changes. This avoids more `ADD COLUMN`s on a table shared with the dev DB. Plan-only.
- **N4. How the concurrent cases are made safe (A-AC-4 concurrent create, A-AC-13 concurrent run and delete):**
  - a service-owned transaction with `pg_advisory_xact_lock`, keyed per finding for create and per agent for start and delete;
  - plus a partial unique index on the new table: `eval_suite_runs(agent_id) WHERE status = 'running'`.
  - Plan-only.
- **N5. `FindingCard` does not know the agent today** (props at `client/src/components/finding-card/FindingCard.tsx:26-42`). A-AC-5 needs an `agentId` prop taken from `ReviewRecord.agent_id`. It has to be passed down through the PR page, `FindingsPanel`, `diff-viewer/FileCard` and `CodeLine` (C-14). `RunFindingsHoverCard` gets no `onAction`, so it shows no control.
- **N6. i18n.**
  - `FindingCard` uses the `prReview` namespace, so its new strings go there.
  - `eval.json` is already staged but registered in neither the test renderer nor anywhere else; it must be added to `client/src/test/render.tsx` (client INSIGHTS 2026-10-01).
  - The staged keys do not cover `history.*`, `compare.*`, refusals or dashboard rows. They will be added in the sections NFR-5 names.
- **N7. Three review-module helpers have to be copied, not imported**, because a module may not import another module's private files:
  - `toSkillPromptBlock` and `taskLine` (`server/src/modules/reviews/helpers.ts:19,100`);
  - the patch → unified-diff rebuild (`server/src/modules/reviews/diff-loader.ts:32-41`).
  - They are copied into `eval/helpers.ts`, and a unit test checks the copies still match the originals. The eval task line must keep the PR title, because A-AC-11 requires it.
- **N8. `MockLLMProvider` cannot do what the tests need.** It returns one fixture per schema and its `id` has no `'openrouter'` (`server/src/adapters/mocks.ts:60-107`). A-AC-12 needs a scripted mock that answers per prompt, can fail, and can hang. T6 adds an optional `structuredFn` and widens `id`. Tests keep using `MockLLMProvider` only.
- **N9. `*.it.test.ts` files skip themselves without Docker** (`server/test/helpers/pg.ts:22-33`, INSIGHTS 2026-07-29). For `verify:l06` to fail without Docker, `dockerAvailable()` must throw when an opt-in env var is set (T7).
- **N10. A local `~/.devdigest/secrets.json` that holds an OpenRouter key turns any provider that is not overridden into real paid calls** (server INSIGHTS 2026-09-25). Every eval it-test overrides all three providers.

No research requests. Execution mode was already decided: multi-agent.

---

# Implementation Plan: Eval Pipeline (Spec A + Spec B)

Specs: A `specs/2026-10-12-eval-cases-and-scoring.md` · B `specs/2026-10-12-eval-run-history-compare.md` · Spec status: approved (both) · Mode: multi-agent · Packages: server (incl. `@devdigest/shared`), client

AC IDs are prefixed with the spec: `A-AC-n`, `B-AC-n`, `A-NFR-n`, `B-NFR-n`.

## 1. Context consulted

**Read in the order CLAUDE.md asks:** `CLAUDE.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `server/INSIGHTS.md`, `client/INSIGHTS.md`, root `INSIGHTS.md` (two packages plus shared), `.claude/references/skill-routing.md`. All were relevant.

**Entries the plan relies on:**
- server INSIGHTS:
  - 2026-10-07: `maxRetries: 0`; assert the request fields, not only the call count; the rate limiter is inert under test.
  - 2026-09-25: no abort `signal`; a timed-out call is still billed; real paid calls in it-tests.
  - 2026-10-09: deepseek-v4-flash `finish_reason=length`.
  - 2026-09-19 and 2026-09-20: `ADD COLUMN IF NOT EXISTS`.
  - 2026-08-05: journal rewrite; generate is not apply; `check()`.
  - 2026-07-29: it-tests self-skip.
  - 2026-10-06: log capture through `req.log`.
  - 2026-09-26: bad id gives `422`.
  - 2026-08-05: duplicate a mapper instead of importing it; `src/db/rows.ts`.
  - 2026-10-01: `pr_files` is filled only on PR open.
- client INSIGHTS: 2026-10-07 (tab parser), 2026-10-01 (`render.tsx` namespaces; `pnpm build` while dev is up), 2026-10-06 (stub fetch for 409; `ErrorState` "Retry"), 2026-09-26 (nowrap and ellipsis), 2026-08-04 (fake timers and `act`), 2026-08-01 (look-alike Unicode in assertions), 2026-09-19 (value imports from shared need `pnpm build`), 2026-09-20 (nav splice).
- root INSIGHTS: 2026-07-29 (client vendor/shared lags; `eval-ci.ts` and `knowledge.ts` differ — confirmed with `diff -q`), 2026-09-18 (dev DB drifted from the migrations folder).

**Code checked:**
- `server/src/db/schema/eval.ts:7-35`
- `server/src/vendor/shared/contracts/knowledge.ts:50-84`, `eval-ci.ts:20-89`
- `reviewer-core/src/review/run.ts:49-237`, `reviewer-core/src/llm/openrouter.ts:27-115`
- `server/src/platform/container.ts:116-126,188-217`, `server/src/adapters/mocks.ts:60-107`
- `server/src/app.ts:86-93` (review reaper), `server/src/platform/errors.ts` (`AppError(code, message, status, details)`)
- `server/src/modules/brief/{routes,service}.ts` (rate-limit config, `withTimeout`, `maxRetries: 0`)
- `server/src/modules/agents/repository.ts:71`, `server/src/modules/reviews/run-executor.ts:198-259,470-490`, `reviewer-core/src/prompt.ts:248-312` (section headings)
- `server/test/helpers/pg.ts`, `server/package.json` (no `verify:l06` yet), `server/drizzle.config.ts`, last migration `0014_graceful_ben_grimm.sql`
- client: `nav.ts:1-61`, `AgentEditor/constants.ts:11-15`, `agents/[id]/page.tsx:11,25` (`parseAgentTab`), `FindingCard.tsx`, `src/test/render.tsx` (no `eval`, no `prReview`), `messages/en/eval.json`, `lib/api.ts` (`ApiError.code`)

## 2. Decisions from the review

- **Mode:** multi-agent, decided by the user (C-23).
- **Experiment model:** `openrouter` / `deepseek/deepseek-v4-flash` (C-22). Only the demonstration uses it.
- N1–N10 above are accepted as plan-only defaults. None of them changes a spec.
- **Open spec issue carried over:** A-AC-10 holds strictly only for `openrouter`. `openai` and `anthropic` adapters keep their transport retries (Risk R1). If the user wants strictness for every provider, `spec-creator` should add it as a later spec about provider resilience.
- **Contract parity means two checks:**
  - (a) fixtures parse under the new schemas;
  - (b) `server/src/vendor/shared/contracts/{eval-ci,knowledge}.ts` are byte-identical to their client copies.
- **The client copy is reconciled on purpose:** both files are copied whole from the server, which also closes their existing lag (`AgentManifest`, openrouter notes).

## 3. Architecture constraints

**Server (onion-architecture):**
- One module `server/src/modules/eval/`, registered statically in `src/modules/index.ts`.
- `routes.ts` is transport only: validate, call one service method, serialize. It declares `params` and `response` from `@devdigest/shared`. Bad ids give `422`.
- Only `repository.ts` imports `drizzle-orm` or `db/schema`.
- Pure scoring, mapping and copied helpers live in `helpers.ts`.
- The orchestrators (`case-runner.ts`, `suite-executor.ts`) are ring 2 and private to the module.
- Agents are reached through `container.agentsRepo` (`getById`, `enabledSkillsForPrompt`). Row types go in `src/db/rows.ts`. Never import `reviews/*` or `agents/*` internals.
- Multi-step writes run in a transaction the service opens, and every repository call inside it gets `tx`.
- `reviewer-core` and `server/src/platform/{prompt,grounding,structured}.ts` are not edited. The grounding gate is reused through `reviewPullRequest` unchanged.
- An eval run never writes `agent_runs` or `run_traces` and never touches `runBus` (NG-9).
- Workspace is resolved through `getContext` (`modules/_shared/context.ts`). A foreign id gives `404`.

**Client (frontend-ui-architecture):**
- Components never call `fetch`. Data goes through `src/lib/hooks/eval.ts` → `src/lib/api.ts`. Server state lives in TanStack Query.
- One PascalCase folder per component, with colocated `helpers.ts`, `styles.ts` and tests. The Evals tab sits under `AgentEditor/_components/`. The dashboard sits under `app/eval/_components/`.
- A helper is promoted to `src/lib/format.ts` only when a second feature uses it (the delta formatter: compare and dashboard).
- Nav is registered in `app-shell/nav.ts`, never in vendor `NAV`.
- Tab keys come from `TABS`.
- Strings are i18n keys only, camelCase, nested by section.

## 4. Contract changes

- **`@devdigest/shared` (server, first).**
  - `contracts/knowledge.ts`: new `EvalExpectation`; `EvalCase` changed (typed `input_files`, `input_meta`, `expected_output`; `notes` nullable).
  - `contracts/eval-ci.ts`:
    - new: `EvalSuiteStatus`, `EvalCaseOutcome`, `EvalActualOutput` (kept `Finding[]`, dropped `{finding, reason}[]` plus the per-case fields of N3), `EvalSuiteRun`, `EvalSuiteRunDetail`, `EvalDashboardRow`;
    - changed: `EvalRunRecord` (+ `suite_run_id`, `outcome`, `expectation_kind`, `findings_kept`, `findings_dropped`, `matched`, `error`);
    - unchanged: `EvalRun`, `EvalCaseInput`, `EvalDashboard`.
- **Client copy:** yes, it must be synced (T2). Whole-file copy of both files, checked by the parity test.
- **Migration:** yes, and it **needs explicit user approval** before T4.
  - New table `eval_suite_runs`.
  - Nullable `eval_runs.suite_run_id` (FK, cascade).
  - Indexes, and a CHECK on `status`.
  - Generated only with `pnpm db:generate` and applied with `pnpm db:migrate`.
  - The dev-DB trap edit is described in T4.

## 5. Tasks

Every task's Verification includes `scripts/check-pkg.sh <pkg> <files>`. "it" means `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run <file>`, which needs Docker and cannot skip silently.

| # | Pkg | What to do (only what the routing table does not imply) | Files | Skills | AC | Test | Verification |
|---|---|---|---|---|---|---|---|
| T0 | — (main) | Baseline `scripts/check-all.sh`. **Read-only** schema check: `docker exec devdigest-postgres psql -U devdigest -d devdigest -c "\d eval_cases" -c "\d eval_runs" -c "\d eval_suite_runs"` and `select count(*) from drizzle.__drizzle_migrations` vs `ls server/src/db/migrations/*.sql \| wc -l`. If `eval_suite_runs` or `suite_run_id` already exist (for example from another branch), stop and ask the user. Get explicit approval for T4. | — | engineering-insights | support (A-NFR-6) | — | output recorded for W2 |
| T1 | server (shared) | Add or change the contracts in §4. Constraints: `end_line ≥ start_line ≥ 1`; metrics in 0..1 and nullable; `name` ≤ 120-char title part is built by the server, not validated. Add the eval schemas to `contracts.test.ts`-style fixtures. Check the barrel `index.ts` exports. | `server/src/vendor/shared/contracts/knowledge.ts`, `.../eval-ci.ts`, `server/test/eval-contracts.test.ts` | onion-architecture, zod | support (all A/B AC) | `eval-contracts.test.ts` (fixture round-trip) | `scripts/check-pkg.sh server server/test/eval-contracts.test.ts` |
| T2 | client (vendor) | Copy both files whole from the server. Confirm `diff -q` for both is empty. Fix any client typecheck fallout from the widened `Provider` union in client code, not in vendor. Add a byte-equality parity case to `eval-contracts.test.ts` (reads both files). | `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `server/test/eval-contracts.test.ts` | frontend-ui-architecture, zod | support | parity case in `eval-contracts.test.ts` | `scripts/check-pkg.sh client` · `scripts/check-pkg.sh server server/test/eval-contracts.test.ts` |
| T3 | server | Drizzle schema. Table `evalSuiteRuns`: `workspaceId` FK cascade; `agentId` uuid with no FK (NG-10); `agentVersion`; `status` + `check()`; `ranAt`; `finishedAt`; `caseIds` / `skills` jsonb; `cases*` ints default 0; nullable metrics, `costUsd`, `durationMs`, `error`. Indexes: `(agent_id, ran_at)`, partial unique `(agent_id) WHERE status='running'`, `(workspace_id)`. `evalRuns.suiteRunId` nullable FK cascade + index. Add `EvalCaseRow`, `EvalRunRow`, `EvalSuiteRunRow` to `rows.ts`. | `server/src/db/schema/eval.ts`, `server/src/db/rows.ts` | onion-architecture, drizzle-orm-patterns, postgresql-table-design | support (A-AC-9, A-AC-12, A-NFR-6) | it-tests of T11, T17, T18 | `scripts/check-pkg.sh server server/src/db/schema/eval.ts` |
| T4 | server | **Needs explicit approval.** Steps 1–6 are listed after this table. | `server/src/db/migrations/0015_*.sql`, `meta/_journal.json`, `meta/0015_snapshot.json` | drizzle-orm-patterns, postgresql-table-design | A-NFR-6 | manual; fresh DB proven by T11, T17, T18 (testcontainer runs every migration) | the commands in steps 1–6 |
| T5 | server | Pure helpers and constants (detailed after this table). | `server/src/modules/eval/{helpers,constants,types}.ts`, `server/test/eval-helpers.test.ts` | onion-architecture | A-AC-12 (unit), A-NFR-8, A-AC-3 (diff build), B-AC-10 (unit) | `eval-helpers.test.ts` | `scripts/check-pkg.sh server server/src/modules/eval/helpers.ts server/test/eval-helpers.test.ts` |
| T6 | server | `MockLLMProvider`: optional `structuredFn(req)` (its return value is validated by the schema; a throw rejects; a never-resolving promise hangs). Widen `id` to include `'openrouter'`. Default behaviour unchanged. | `server/src/adapters/mocks.ts`, `server/test/adapters.test.ts` | onion-architecture | support (A-AC-10, A-AC-12, A-NFR-2) | `adapters.test.ts` (new cases) | `scripts/check-pkg.sh server server/src/adapters/mocks.ts` |
| T7 | server | `verify:l06` script (detailed after this table). | `server/package.json`, `server/test/helpers/pg.ts` | onion-architecture | A-NFR-10, B-NFR-6 | manual: with and without Docker (W5) | `cd server && pnpm verify:l06` |
| T8 | server | Repository (detailed after this table). | `server/src/modules/eval/repository.ts` | onion-architecture, drizzle-orm-patterns, postgresql-table-design | support (A-AC-1..4, A-AC-7..13; B-AC-4, B-AC-10) | T11, T17, T18 | `scripts/check-pkg.sh server server/src/modules/eval/repository.ts` |
| T9 | server | `EvalService.fromContainer`. `createCaseFromFinding`: R-1 order — not_found → finding_undecided → no_agent (agent via `container.agentsRepo.getById`) → duplicate (`AppError('duplicate', …, 409, { case_id })`) → patch_unavailable. Runs inside a transaction holding the finding lock. `listCases` (`404` for unknown or foreign agent). `deleteCase`: transaction with agent lock; a running suite gives `409 eval_run_in_progress`. | `server/src/modules/eval/service.ts` | onion-architecture, drizzle-orm-patterns | A-AC-1, A-AC-2, A-AC-3, A-AC-4, A-AC-7, A-AC-8, A-AC-13 (delete) | T11 | `scripts/check-pkg.sh server server/src/modules/eval/service.ts` |
| T10 | server | Routes: `POST /findings/:id/eval-case` (`201`, `config.rateLimit` 30/min), `GET /agents/:id/eval-cases`, `DELETE /eval-cases/:id`. Params from `_shared/schemas.ts`, `schema.response` from shared. Register `eval` in `modules/index.ts`. | `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts` | onion-architecture, fastify-best-practices, zod, security | A-AC-1, A-AC-4, A-AC-7, A-AC-8, A-NFR-4 | T11 | `scripts/check-pkg.sh server server/src/modules/eval/routes.ts` |
| T11 | server | it-test for cases (detailed after this table). | `server/test/eval-cases.it.test.ts` | onion-architecture, fastify-best-practices | A-AC-1, A-AC-2, A-AC-3, A-AC-4, A-AC-7, A-NFR-4 | itself | it `test/eval-cases.it.test.ts` |
| T12 | server | Container `llmSingleShot(id, { timeoutMs })`: overrides win (same as `llm`). `openrouter` gives `new OpenRouterProvider(key, { maxRetries: 0, timeoutMs, estimateCost })`, not cached together with `llm()`. `openai` / `anthropic` fall back to `llm(id)`; leave a comment naming the transport-retry gap (R1). | `server/src/platform/container.ts` | onion-architecture | A-AC-10 | T17 (override path) | `scripts/check-pkg.sh server server/src/platform/container.ts` |
| T13 | server | Case runner (detailed after this table). | `server/src/modules/eval/case-runner.ts`, `server/test/eval-case-runner.test.ts` | onion-architecture | A-AC-10, A-AC-11, A-NFR-2, C-22 handling | `eval-case-runner.test.ts` | `scripts/check-pkg.sh server server/src/modules/eval/case-runner.ts server/test/eval-case-runner.test.ts` |
| T14 | server | Suite start and executor (detailed after this table). | `server/src/modules/eval/{service,suite-executor}.ts` | onion-architecture, drizzle-orm-patterns | A-AC-9, A-AC-10, A-AC-12, A-AC-13, A-NFR-1, A-NFR-5 | T17 | `scripts/check-pkg.sh server server/src/modules/eval/suite-executor.ts` |
| T15 | server | Boot reaper: in `app.ts`, right after the review reaper, a non-fatal `EvalService.fromContainer(container).reapInterrupted()`. It sets `failed`, `error 'interrupted'`, `finished_at`, and aggregates over the stored rows. Case rows are kept. | `server/src/app.ts`, `server/src/modules/eval/service.ts` | onion-architecture, fastify-best-practices | A-NFR-3 | T17 | `scripts/check-pkg.sh server server/src/app.ts` |
| T16 | server | Routes: `POST /agents/:id/eval-runs` (`202`, 5/min), `GET /eval-runs/:id`, `GET /agents/:id/eval-runs` (≤ 50, newest first), `GET /eval/dashboard` (order per B-AC-10). All with `schema.response`. Pass `req.log` to `startSuite`. | `server/src/modules/eval/{routes,service}.ts` | onion-architecture, fastify-best-practices, zod, security | A-AC-9, A-AC-13, B-AC-4, B-AC-10, B-NFR-4 | T17, T18 | `scripts/check-pkg.sh server server/src/modules/eval/routes.ts` |
| T17 | server | it-test for runs (detailed after this table). | `server/test/eval-runs.it.test.ts` | onion-architecture, fastify-best-practices | A-AC-8 (server), A-AC-9..13, A-NFR-1, A-NFR-3, A-NFR-4, A-NFR-5, NG-9 | itself | it `test/eval-runs.it.test.ts` |
| T18 | server | it-test for history and dashboard (detailed after this table). | `server/test/eval-history.it.test.ts` | onion-architecture, fastify-best-practices | B-AC-4 (server), B-AC-10 (server), B-NFR-2, B-NFR-4 | itself | it `test/eval-history.it.test.ts` |
| T19 | server, client | Docs: the API map for the 7 routes in `server/README.md`; the `/eval` route and the Evals tab in `client/README.md`. | `server/README.md`, `client/README.md` | — (doc-writer: mermaid-diagram if a diagram is added) | support | — | review |
| T20 | client | i18n (detailed after this table). | `client/messages/en/{eval,prReview,agents}.json`, `client/src/test/render.tsx` | frontend-ui-architecture | B-NFR-5; support A-AC-5, A-AC-7 | covered by T24–T29 component tests (no missing-message errors) | `scripts/check-pkg.sh client client/src/test/render.tsx` |
| T21 | client | Hooks (detailed after this table). | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.tsx`, possibly `client/src/lib/hooks/agents.ts` | frontend-ui-architecture, react-best-practices, react-testing-library | support (B-AC-2 polling) | `eval.test.tsx` | `scripts/check-pkg.sh client client/src/lib/hooks/eval.ts` |
| T22 | client | `registerEvalDashboardNav()`: spliced right after `agents` in SKILLS LAB, idempotent, called after `registerAgentsInSkillsLab()`, so the order is Skills, Agents, Eval Dashboard, Conventions. `href: "/eval"`, an existing `IconName`, no `gKey` that clashes. | `client/src/components/app-shell/nav.ts`, `.../nav.test.ts`, `.../helpers.test.ts` (active key for `/eval`, `/eval/x`) | frontend-ui-architecture, react-testing-library | B-AC-11 | `nav.test.ts`, `helpers.test.ts` | `scripts/check-pkg.sh client client/src/components/app-shell/nav.ts` |
| T23 | client | Add `{ key: "evals", labelKey: "editor.tabs.evals", … }` to `TABS`. Make sure `parseAgentTab` derives its values from `TABS`, with a test over every `TABS` key. `AgentEditor` renders `EvalsTab` for `evals`. | `AgentEditor/{constants.ts,helpers.ts,helpers.test.ts,AgentEditor.tsx}`, `AgentEditor/_components/EvalsTab/{EvalsTab.tsx,index.ts}` | frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library | support (A-AC-7; B-AC-1..9) | `helpers.test.ts` | `scripts/check-pkg.sh client <files>` |
| T24 | client | `FindingCard` eval control (detailed after this table). | `client/src/components/finding-card/{FindingCard.tsx,FindingCard.test.tsx}`, `.../EvalCaseControl/{EvalCaseControl.tsx,index.ts,helpers.ts,styles.ts,EvalCaseControl.test.tsx,helpers.test.ts}`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `.../_components/FindingsPanel/FindingsPanel.tsx`, `client/src/components/diff-viewer/{FileCard/FileCard.tsx,CodeLine/CodeLine.tsx}` | frontend-ui-architecture, react-best-practices, react-testing-library | A-AC-5, A-AC-6, A-NFR-7 | `EvalCaseControl.test.tsx`, `FindingCard.test.tsx` | `scripts/check-pkg.sh client <files>` |
| T25 | client | Cases list: name, kind as a text badge (`@devdigest/ui` primitive), `file:start_line` with nowrap and ellipsis, empty and loading texts, Delete behind a confirmation, inline error for `409`. | `.../EvalsTab/EvalCasesList/{EvalCasesList.tsx,index.ts,styles.ts,EvalCasesList.test.tsx}` | frontend-ui-architecture, react-best-practices, react-testing-library | A-AC-7, A-AC-8 (confirmation) | `EvalCasesList.test.tsx` | `scripts/check-pkg.sh client <files>` |
| T26 | client | Run control: "Run eval (n)" → confirmation showing n and the last finished run's `cost_usd` ("—" when missing). POST is sent only on confirm. While a suite is running: "k / n cases" from the poll, and no Run button. Refusal text by code (409, 422, 429). Status text: `partial` with the errored count, `failed` with the reason. A running suite is found on load from the history (newest `running`). | `.../EvalsTab/EvalRunControl/{EvalRunControl.tsx,index.ts,helpers.ts,EvalRunControl.test.tsx}` | frontend-ui-architecture, react-best-practices, react-testing-library | B-AC-1, B-AC-2, B-AC-3, B-NFR-3 | `EvalRunControl.test.tsx` (fake timers + `act`; `vi.stubGlobal` for 409) | `scripts/check-pkg.sh client <files>` |
| T27 | client | History table (columns of B-AC-4, "—" for nulls, empty state). Checkboxes are enabled only for `done` / `partial`. Compare stays disabled, with the reason text, unless exactly 2 runs are selected. `ErrorState` with Retry. | `.../EvalsTab/EvalRunHistory/{EvalRunHistory.tsx,index.ts,helpers.ts,EvalRunHistory.test.tsx}` | frontend-ui-architecture, react-best-practices, react-testing-library | B-AC-4, B-AC-5, B-AC-13, B-NFR-1 | `EvalRunHistory.test.tsx` | `scripts/check-pkg.sh client <files>` |
| T28 | client | Compare view (detailed after this table). | `.../EvalsTab/EvalCompare/{EvalCompare.tsx,index.ts,helpers.ts,helpers.test.ts,EvalCompare.test.tsx}` + nested `CompareMetrics/`, `CompareCasesTable/`, `PromptDiff/`, `client/src/lib/format.ts` (+ test) | frontend-ui-architecture, react-best-practices, react-testing-library | B-AC-6, B-AC-7, B-AC-8, B-AC-9, B-AC-13, B-NFR-1, B-NFR-4 | `EvalCompare.test.tsx`, `helpers.test.ts`, `format.test.ts` | `scripts/check-pkg.sh client <files>` |
| T29 | client | Thin `app/eval/page.tsx` with breadcrumbs (`page.*`) and `EvalDashboard`: row content per B-AC-10 (ellipsis on names, "drop" and "running" as text, "never run", link `/agents/:id?tab=evals`), rendered in the server's order; empty state with a link to `/agents`; `ErrorState` with Retry. | `client/src/app/eval/page.tsx`, `client/src/app/eval/_components/EvalDashboard/{EvalDashboard.tsx,index.ts,styles.ts,EvalDashboard.test.tsx}` | frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library | B-AC-10, B-AC-12, B-AC-13, B-NFR-1 | `EvalDashboard.test.tsx` | `scripts/check-pkg.sh client <files>` |

### Task details

**T4 — migration (needs explicit approval)**
1. `cd server && pnpm db:generate`. If it hangs on a rename prompt, stop: none is expected, because nothing is dropped.
2. `git diff src/db/migrations/meta/_journal.json` must show exactly one appended entry and no rewritten tags (INSIGHTS 2026-08-05).
3. Edit the generated SQL as server/INSIGHTS 2026-09-19 and 2026-09-20 sanction:
   - `ALTER TABLE "eval_runs" ADD COLUMN IF NOT EXISTS "suite_run_id"`;
   - `CREATE TABLE IF NOT EXISTS`;
   - `CREATE [UNIQUE] INDEX IF NOT EXISTS`;
   - keep the FK in drizzle's `DO $$ … duplicate_object` block.
4. `pnpm db:migrate`. It must end with `✓ migrations applied`; NOTICE lines are fine.
5. `pnpm db:generate` again must print "No schema changes".
6. `psql \d eval_suite_runs` and `\d eval_runs` must match the schema.

**T5 — pure helpers and constants**
- Helpers:
  - `matches()` (exact path, closed ranges intersect, tolerance 0) and `scoreCase()` (outcome, pass, matched, kept/dropped counts);
  - `aggregateSuite()` over stored outputs: recall, strict precision, citation, the null rules, status, cost sum, `cases_*`;
  - `buildCaseName()` (title cut to 120);
  - `buildSingleFileDiff(path, patch)` (copy of the diff-loader rebuild) and `evalSkillBlock()` (copy of `toSkillPromptBlock`);
  - `evalTaskLine(input_meta)` (contains the title);
  - `truncateError(300)` that strips key-like tokens;
  - DTO mappers;
  - `dashboardRows()` (delta, `drop`, ordering, null-delta rule).
- Constants:
  - `EVAL_CASE_TIMEOUT_MS = 60_000`;
  - `EVAL_MAX_OUTPUT_TOKENS = 4096`. Large enough for a reasoning model's thinking plus a Review JSON. The worst case 8 × (in + 4096 out) stays near $0.05 at deepseek-v4-flash prices — recheck with the PriceBook;
  - `EVAL_MAX_CASES = 100`, `EVAL_HISTORY_LIMIT = 50`, rate limits 5 and 30.
- Tests: every Scoring rule and every null case (EC-5, EC-6, EC-18, EC-19), re-scoring determinism (NFR-8), and the parity checks of the copied helpers against the reviews originals.

**T7 — `verify:l06` script**
- Add `"verify:l06": "DEVDIGEST_REQUIRE_DOCKER=1 vitest run test/contracts.test.ts test/eval-"`. The filename filter matches every eval unit and it file. Vitest exits 1 when it finds no files.
- In `pg.ts`, `dockerAvailable()` throws `verify:l06 requires Docker (docker info failed)` when that env var is set. The it files' top-level await then fails the run instead of skipping.
- It never sets `HOME`. Changing `HOME` breaks `docker info` (INSIGHTS 2026-09-25).

**T8 — repository**
- Finding scope: finding + review (`agent_id`, `run_id`, `workspace_id`) + PR (`number`, `title`, `body`, `head_sha`) + repo owner/name + the `pr_files.patch` for the finding's file.
- Cases: `findCaseBySourceFinding`, `insertCase`, `listCasesByAgent` (`ORDER BY name`), `getCase`, `deleteCase`.
- Locks: `lockFinding` / `lockAgent`, i.e. `pg_advisory_xact_lock(hashtext(…))` on `tx`.
- Suites: `insertSuiteRun` (maps a unique violation to "running"), `getRunningSuite`, `bumpProgress`, `finalizeSuite`, `insertCaseRun`, `getSuiteDetail` (in `case_ids` order, with `case_name`), `listSuitesByAgent(50)`, `reapRunning`.
- Dashboard query: agents with ≥ 1 case and still existing (join `agents`), latest 2 finished suites per agent, a running flag.
- Every method takes an optional `tx`.

**T11 — it-test for cases**
- Fixture builder: repo, PR, `pr_files` patch, a review with an agent, findings in each state.
- Provider overrides for `openai` / `anthropic` / `openrouter`.
- Cases:
  - A-AC-1 and A-AC-2: body and row;
  - A-AC-3: flip the finding, delete the review, delete the PR → `input_*` and `expected_output` are identical;
  - A-AC-4: every R-1 row, plus `Promise.all` of two creates → one `201` and one `409 duplicate` carrying `case_id`;
  - A-AC-7: sorted by name, only this agent's cases, foreign `404`;
  - A-NFR-4: foreign `404`, and the 31st POST → `429` on an app built with `nodeEnv: 'development'`.

**T13 — case runner**
- `guardProvider(llm)` sets `maxRetries: 0`, `maxTokens: EVAL_MAX_OUTPUT_TOKENS` and `timeoutMs: 60_000` on each request and races a 60 s timer (cleared once the call settles).
- `runCase()` calls `reviewPullRequest` (import it from the same path `run-executor.ts` uses) with:
  - `systemPrompt`, `model`, `diff: parseUnifiedDiff(input_diff)`, `llm: guarded`, `strategy: 'single-pass'`, `maxRetries: 0`;
  - `skills`; `prDescription` only when `pr_body` is set; `task: evalTaskLine`;
  - **no** `callers`, `repoMap`, `specs`, `intent` or `memory`.
- Errors become an `error` outcome:
  - timeout → "timed out after 60 s (the call may still be billed)";
  - schema failure → "model output failed schema validation (possibly truncated at max_tokens=4096)";
  - missing key → the ConfigError message;
  - all texts go through `truncateError`.
- Unit tests:
  - the captured request carries `maxRetries: 0`, `timeoutMs: 60000` and `maxTokens`;
  - a never-resolving mock with fake timers gives `error` once 60 s pass;
  - a schema-failing mock gives the truncation-hint text;
  - none of `## Repo skeleton`, `## Callers of changed symbols`, `## Project context`, `## Stated intent`, `## Relevant memory` appears;
  - exactly 1 call.

**T14 — suite start and executor**
- `startSuite(ws, agentId, log)`:
  1. `agentsRepo.getById` (disabled agents allowed) → `404`;
  2. transaction holding the agent lock: running → `409 eval_run_in_progress`; 0 cases → `422 no_cases`; more than 100 → `422 too_many_cases`;
  3. `skills` = names from `enabledSkillsForPrompt`;
  4. insert the suite as `running` (`case_ids` in name order, `agent_version` = the current version);
  5. return it with `202`, then start `void executor.execute(…)`.
- The executor:
  - resolves `llmSingleShot` first; if that fails, the suite is `failed` with the reason and no case runs;
  - runs the cases one after another; after each it inserts an `eval_runs` row (`suite_run_id`, pass, cost, duration, the per-case metrics from the same scorer, `actual_output` per N3) and bumps the counters;
  - at the end aggregates from the stored rows and writes the log line `eval suite <id>: <status>, <p>/<t> passed, cost <usd|n/a>` through the captured `req.log`;
  - catches everything at the top level, so a suite never stays `running`;
  - writes nothing to `agent_runs` or `run_traces`.

**T17 — it-test for runs**
- A-AC-9: shape, `skills` order, a disabled agent still gets `202`.
- A-AC-10: mock call count equals `cases_total`; every request has `maxRetries: 0` and `timeoutMs: 60000`; repeated GETs add 0 calls.
- A-AC-11: agent with `repo_intel` on and an attached context doc → the diff equals `input_diff`, title and body are present, no excluded heading appears.
- A-AC-12:
  - ≥ 8 fixture cases of both kinds, one dropped citation, one throwing call → `partial` with exact metric values;
  - all calls failing → `failed`;
  - an override that throws ConfigError → `failed` with the reason;
  - prompt v1 vs v2 (`PUT /agents/:id`) with a `structuredFn` that answers by system prompt → Δrecall or Δprecision ≥ 0.2.
- A-AC-13: every R-2 row; concurrent POSTs → exactly one `202`; delete during a run → `409`. A deferred mock holds the suite in `running`.
- A-AC-8: finish a suite, delete a case → the aggregates are identical.
- A-NFR-1: the suite cost is the sum of non-null case costs.
- A-NFR-3: insert a `running` suite, boot the app → `failed` / `interrupted`, case rows kept.
- A-NFR-4: foreign `404`; the 6th POST → `429` with `nodeEnv: 'development'`.
- A-NFR-5: the log line, captured through an `app.log.child` wrapper; dropped reasons readable through the GET.
- NG-9: `agent_runs` and `run_traces` counts unchanged.

**T18 — it-test for history and dashboard**
- B-AC-4: newest first; a cap of 50 out of 55 rows inserted directly; foreign `404`.
- B-AC-10: only agents with cases; a deleted agent is left out; latest finished = `done` / `partial`; delta against the previous finished run; a null on either side gives a null delta and no `drop`; the running flag; drop rows first, then by name; workspace scoping.
- B-NFR-2: 20 agents × 50 runs, p95 ≤ 300 ms over 20 calls. If testcontainer timing turns out flaky, move it to a manual profile and say so.

**T20 — i18n**
- `eval.json`: extend `evalsTab.*` (kind badges, run confirmation, progress, refusals, statuses) and `dashboard.*` (rows, drop, running, never run, empty, link). Add `history.*` and `compare.*`.
- `prReview.json`: `finding.evalCase.{turnIntoMustFind, turnIntoMustNotFlag, inSet, errors.*}`.
- `agents.json`: `editor.tabs.evals`.
- Register `eval` (and `prReview` if a new test needs it) in `render.tsx`.

**T21 — hooks**
- `useAgentEvalCases(agentId|null)`, `useCreateEvalCase`, `useDeleteEvalCase`, `useStartEvalRun`, `useEvalRun(id)` (`refetchInterval: 2000` while `running`), `useAgentEvalRuns`, `useEvalDashboard`.
- Use the agent-version hook if it already exists in `agents.ts`; otherwise add it there.
- Invalidations: case create/delete → `["eval-cases", agentId]`; run start, and a polled run finishing → `["eval-runs", agentId]` and `["eval-dashboard"]`.
- Prefer `import type` from shared.

**T24 — `FindingCard` eval control**
- New `agentId?: string \| null` prop. The control renders only when `onAction && agentId && (accepted || dismissed)`.
- `helpers.ts`: `evalControlState(f, agentId, cases)` returns none, button (must_find / must_not_flag) or link (to `/agents/:id?tab=evals`).
- The button's accessible name contains the expectation.
- Pending → disabled. On error: re-enabled, with inline text by `ApiError.code` or a network-error fallback.
- Pass `agentId` down from `ReviewRecord.agent_id` through every consumer that has an `onAction` (C-14).

**T28 — compare view**
- Run A is the one with the older `ran_at`.
- Metrics: both values plus a signed delta as text, from `src/lib/format.ts` `formatSignedDelta` (second consumer: the dashboard). **Pick the minus character explicitly and assert its code point.**
- Notice "Metrics are over different case sets".
- Per-case table over the union of `case_ids`: `not in run` or `case deleted` (id in `case_ids` with no record), duration and cost, rows whose outcome differs first.
- `PromptDiff`: an LCS line diff in `helpers.ts`; an `aria-expanded` toggle, collapsed by default; "+" / "−" as text markers; "Same system prompt" when the versions or the prompts are equal. Fetch the versions only when they differ.
- Everything is plain text; a `<script>` title must render literally.
- `ErrorState` with Retry.

### Checklist form

- [ ] T1 shared eval contracts → support → `eval-contracts.test.ts`
- [ ] T2 client vendor copy reconciled → support → parity case in `eval-contracts.test.ts`
- [ ] T3 Drizzle schema → support (A-AC-9, A-AC-12, A-NFR-6) → T11, T17, T18
- [ ] T4 migration (needs approval) → A-NFR-6 → manual generate / migrate / "No schema changes" + fresh-DB it-lane
- [ ] T5 scoring and helpers → A-AC-12, A-NFR-8, B-AC-10 → `eval-helpers.test.ts`
- [ ] T6 `MockLLMProvider` scripted mode → support → `adapters.test.ts`
- [ ] T7 `verify:l06` fails without Docker → A-NFR-10, B-NFR-6 → manual run with and without Docker
- [ ] T8 repository → support → it-tests
- [ ] T9 case service → A-AC-1, 2, 3, 4, 7, 8, 13 → `eval-cases.it.test.ts`, `eval-runs.it.test.ts`
- [ ] T10 case routes + module registration → A-AC-1, 4, 7, 8, A-NFR-4 → `eval-cases.it.test.ts`
- [ ] T11 → A-AC-1, 2, 3, 4, 7, A-NFR-4 → `eval-cases.it.test.ts`
- [ ] T12 single-shot provider → A-AC-10 → `eval-runs.it.test.ts`
- [ ] T13 case runner → A-AC-10, 11, A-NFR-2 → `eval-case-runner.test.ts`
- [ ] T14 suite start and executor → A-AC-9, 10, 12, 13, A-NFR-1, 5 → `eval-runs.it.test.ts`
- [ ] T15 boot reaper → A-NFR-3 → `eval-runs.it.test.ts`
- [ ] T16 run, history and dashboard routes → A-AC-9, 13, B-AC-4, 10, B-NFR-4 → `eval-runs.it.test.ts`, `eval-history.it.test.ts`
- [ ] T17 → A-AC-8 (server), 9–13, A-NFR-1, 3, 4, 5 → `eval-runs.it.test.ts`
- [ ] T18 → B-AC-4, 10 (server), B-NFR-2, 4 → `eval-history.it.test.ts`
- [ ] T19 docs → support → review
- [ ] T20 i18n + `render.tsx` → B-NFR-5 → component tests
- [ ] T21 hooks → support → `eval.test.tsx`
- [ ] T22 nav → B-AC-11 → `nav.test.ts`, `helpers.test.ts`
- [ ] T23 Evals tab key from `TABS` → support → `AgentEditor/helpers.test.ts`
- [ ] T24 `FindingCard` control → A-AC-5, 6, A-NFR-7 → `EvalCaseControl.test.tsx`, `FindingCard.test.tsx`
- [ ] T25 cases list → A-AC-7, 8 → `EvalCasesList.test.tsx`
- [ ] T26 run control → B-AC-1, 2, 3, B-NFR-3 → `EvalRunControl.test.tsx`
- [ ] T27 history → B-AC-4, 5, 13, B-NFR-1 → `EvalRunHistory.test.tsx`
- [ ] T28 compare → B-AC-6, 7, 8, 9, 13, B-NFR-1, 4 → `EvalCompare.test.tsx`, `helpers.test.ts`, `format.test.ts`
- [ ] T29 dashboard → B-AC-10, 12, 13, B-NFR-1 → `EvalDashboard.test.tsx`

## 6. Execution (multi-agent)

Implementers share one working tree. Each wave has at most one agent per package, and no files overlap inside a wave.

| Phase | Lane S (server) | Lane C (client) | Waits for | Merge point (main session) |
|---|---|---|---|---|
| W0 | T0, done by the main session | — | — | baseline `check-all.sh`; schema snapshot; **user approval for T4** |
| W1 | Agent "contracts": T1 → T2 (one agent, two packages, run in sequence) | — | W0 | `check-all.sh`; `diff -q` of the two contract files is empty; commit "contracts" |
| W2 | Agent S1: T3 → T4 (only with approval) → T5 → T6 → T7 | Agent C1: T20 → T21 → T22 → T23 | W1 (the contracts are the only shared input) | `check-all.sh`; main session reruns `pnpm db:generate` → "No schema changes"; commit per lane |
| W3 | Agent S2: T8 → T9 → T10 → T11 | Agent C2: T24 → T25 | W2 (S: schema + helpers; C: hooks + i18n + tab) | `check-all.sh`; `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run test/eval-cases.it.test.ts`; commit per lane |
| W4 | Agent S3: T12 → T13 → T14 → T15 → T16 → T17 → T18 | Agent C3: T26 → T27 → T28 → T29 | W3 | `check-all.sh`; `cd server && pnpm verify:l06`; commit per lane |
| W5 | main session: full verification (§7), then `test-writer`, `architecture-reviewer`, `plan-verifier`; `doc-writer` for T19 | | W4 | fill the Commit column of §8 |
| W6 | **Paid demonstration, gated by the user** (§7) | | W5 green + explicit user approval | — |

There are 7 implementer runs: 1 + 2 + 2 + 2. That costs more than a single run. It pays off here because the client lane (T20–T29) needs only the contracts and stubbed fetch, so it runs in parallel with the whole server lane.

## 7. Test plan

**Per task:** `scripts/check-pkg.sh <server|client> <files>`. This runs the typecheck plus the related hermetic tests. Server `pnpm typecheck` excludes `test/**`; vitest catches type errors in test files.

**Per lane at the end of a wave:** `scripts/check-pkg.sh server` and `scripts/check-pkg.sh client`. The main session runs `scripts/check-all.sh` as the baseline and after every wave.

**DB-backed (needs Docker, never runs inside check-pkg):**
- `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run test/eval-cases.it.test.ts test/eval-runs.it.test.ts test/eval-history.it.test.ts`
- Every eval it-test overrides all three providers with `MockLLMProvider` and asserts the mock call count, so it spends $0.

**`verify:l06`** (A-NFR-10, B-NFR-6), `cd server && pnpm verify:l06`. It runs:
- `contracts.test.ts`, `eval-contracts.test.ts` (fixtures + client parity), `eval-helpers.test.ts`, `eval-case-runner.test.ts`, `adapters.test.ts` scripted-mock cases (via the `test/eval-` filter add `adapters` explicitly if needed);
- `eval-cases.it.test.ts`, `eval-runs.it.test.ts`, `eval-history.it.test.ts`.

It must:
- (a) be green with Docker;
- (b) exit non-zero with Docker stopped, or with `DOCKER_HOST=unix:///nonexistent pnpm verify:l06`, and never report "skipped";
- (c) use only `MockLLMProvider`.

**Client:**
- `cd client && pnpm test` covers A-AC-5, A-AC-6, A-AC-7 (component), A-AC-8 (confirmation), A-NFR-7, B-AC-1…13 (component parts), B-NFR-1, 3, 4, 5.
- Then `cd client && pnpm build`, with `next dev` stopped (client INSIGHTS 2026-10-01). It catches webpack-only problems with value imports from `@devdigest/shared`.

**Migration check:** `cd server && pnpm db:generate` → "No schema changes", plus `psql \d` of both tables.

**Not run:** e2e (no AC asks for a flow) and `evals/` (no skill or agent file changes; NG-12).

**W6 — paid demonstration (user-gated, never inside `verify:l06`):**
- **Precondition:** an OpenRouter key; the expected spend announced to the user and confirmed (A-NFR-1); the dev DB migrated (T4).
- **Step 1, making the real cases (C-11):**
  - Open each fork PR once (`GET /pulls/:id`), or `pr_files` stays empty and creation gives `patch_unavailable`.
  - Run real reviews with the seeded `deepseek/deepseek-v4-flash` agent until ≥ 8 findings exist.
  - Accept or dismiss them, both kinds, and turn each into a case.
  - Estimate: 2–4 review runs at about $0.01–0.03 each, **≤ $0.12**.
- **Step 2, NFR-9 experiment:** four suite runs — v1, v1 again, v2 (edited prompt), broken prompt — over the same ≥ 8 cases.
  - Each suite ≤ $0.05 (worst case 8 × (≈6k in + 4096 out) at the current price; recompute with the PriceBook before starting).
  - **≤ $0.20** in total.
- **Overall cap ≈ $0.32.**
- **Stop rules:**
  - a suite's `cost_usd` > $0.05 → stop and report;
  - `error` cases dominate (`max_tokens` truncation) → stop; the user decides whether to raise `EVAL_MAX_OUTPUT_TOKENS` or switch model (C-22). The spec does not change.
  - Timed-out calls may be billed with unknown cost; say so in the report.
- **Hand-in:** a screenshot of the compare view (v1 vs v2) and a screencast. Record |Δ| against the v1/v1 spread (NFR-9).

## 8. Coverage matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| A-AC-1 | T1, T8, T9, T10 | `eval-cases.it.test.ts` | |
| A-AC-2 | T8, T9, T10 | `eval-cases.it.test.ts` | |
| A-AC-3 | T5, T8, T9 | `eval-cases.it.test.ts`, `eval-helpers.test.ts` (diff build) | |
| A-AC-4 | T8, T9, T10 | `eval-cases.it.test.ts` (each R-1 row + concurrent create) | |
| A-AC-5 | T20, T21, T24 | `EvalCaseControl.test.tsx`, `FindingCard.test.tsx` | |
| A-AC-6 | T24 | `EvalCaseControl.test.tsx` (stubbed `409 patch_unavailable`) | |
| A-AC-7 | T8, T9, T10, T23, T25 | `eval-cases.it.test.ts`, `EvalCasesList.test.tsx` | |
| A-AC-8 | T9, T10, T25 | `eval-runs.it.test.ts` (aggregates unchanged), `EvalCasesList.test.tsx` (confirmation) | |
| A-AC-9 | T3, T14, T16 | `eval-runs.it.test.ts` | |
| A-AC-10 | T6, T12, T13, T14 | `eval-runs.it.test.ts`, `eval-case-runner.test.ts` | |
| A-AC-11 | T13 | `eval-runs.it.test.ts`, `eval-case-runner.test.ts` | |
| A-AC-12 | T5, T6, T14 | `eval-helpers.test.ts`, `eval-runs.it.test.ts` (≥ 8 cases, partial, v1/v2 Δ ≥ 0.2) | |
| A-AC-13 | T9, T14, T16 | `eval-runs.it.test.ts` (each R-2 row + concurrent POST) | |
| A-NFR-1 | T14 | `eval-runs.it.test.ts` (cost sum); W6 manual | |
| A-NFR-2 | T13 | `eval-case-runner.test.ts` (fake timers) | |
| A-NFR-3 | T15 | `eval-runs.it.test.ts` | |
| A-NFR-4 | T10, T16 | `eval-cases.it.test.ts`, `eval-runs.it.test.ts` (404, 429) | |
| A-NFR-5 | T14 | `eval-runs.it.test.ts` (log line, dropped reasons) | |
| A-NFR-6 | T3, T4 | manual (generate → "No schema changes"); fresh-DB it-lane | |
| A-NFR-7 | T24 | `EvalCaseControl.test.tsx` (role and name) | |
| A-NFR-8 | T5 | `eval-helpers.test.ts` | |
| A-NFR-9 | — | W6 manual (four suites) | |
| A-NFR-10 | T7 | manual `pnpm verify:l06` with and without Docker | |
| B-AC-1 | T21, T26 | `EvalRunControl.test.tsx` | |
| B-AC-2 | T21, T26 | `EvalRunControl.test.tsx` (fake timers) | |
| B-AC-3 | T26 | `EvalRunControl.test.tsx` | |
| B-AC-4 | T8, T16, T27 | `eval-history.it.test.ts`, `EvalRunHistory.test.tsx` | |
| B-AC-5 | T27 | `EvalRunHistory.test.tsx` | |
| B-AC-6 | T28 | `EvalCompare.test.tsx`, `format.test.ts` | |
| B-AC-7 | T28 | `EvalCompare.test.tsx`, `helpers.test.ts` | |
| B-AC-8 | T28 | `EvalCompare.test.tsx` | |
| B-AC-9 | T21, T28 | `EvalCompare.test.tsx`, `helpers.test.ts` (line diff) | |
| B-AC-10 | T5, T8, T16, T29 | `eval-helpers.test.ts`, `eval-history.it.test.ts`, `EvalDashboard.test.tsx` | |
| B-AC-11 | T22 | `nav.test.ts`, `app-shell/helpers.test.ts` | |
| B-AC-12 | T29 | `EvalDashboard.test.tsx` | |
| B-AC-13 | T27, T28, T29 | `EvalRunHistory.test.tsx`, `EvalCompare.test.tsx`, `EvalDashboard.test.tsx` (fetch 500 → "Retry") | |
| B-NFR-1 | T26–T29 | component role and name queries | |
| B-NFR-2 | T8, T18 | `eval-history.it.test.ts` timing (or manual profile) | |
| B-NFR-3 | T26 | `EvalRunControl.test.tsx` (POST is the only mutating request) | |
| B-NFR-4 | T16, T28 | `eval-history.it.test.ts`, `EvalCompare.test.tsx` (`<script>` renders literally) | |
| B-NFR-5 | T20 | component tests (no missing-message errors) | |
| B-NFR-6 | T7 | manual `verify:l06` + `pnpm test` | |

## 9. Risks and known traps

- **R1. Strict single-shot holds only for `openrouter` (N1).** `openai` and `anthropic` adapters keep `withRetry` and SDK retries on transient errors. A test that passes says nothing about those providers.
- **R2. Truncation by a reasoning model is not visible as such (N2, server INSIGHTS 2026-10-09).** Raising the timeout does not help; only `maxTokens` matters. A demonstration where most cases are `error` is a model decision for the user (C-22).
- **R3. A timed-out call is still billed** (no abort `signal`, INSIGHTS 2026-09-25). After the timeout the case result must not be overwritten. The race winner is final: the guard settles once, and late results are ignored.
- **R4. Migration traps:**
  - the dev DB is shared across branches (`IF NOT EXISTS`, 2026-09-19 and 2026-09-20);
  - the dev DB may already hold an `eval_suite_runs` from another branch (T0 → stop and ask);
  - journal rewrite (2026-08-05; check the `_journal.json` diff);
  - generate is not apply (2026-08-05; run `db:migrate`);
  - `relation … does not exist` means migrate was skipped.
- **R5. it-tests skip silently without Docker.** That is why `DEVDIGEST_REQUIRE_DOCKER` exists. Never change `HOME` without `DOCKER_HOST`.
- **R6. Real paid calls in tests** if any provider is left without an override (INSIGHTS 2026-09-25). Override all three and assert the mock call counts.
- **R7. The rate limiter is inert under `nodeEnv: 'test'`.** The `429` cases need a `development` app (INSIGHTS 2026-10-07).
- **R8. A log line written on `app.log` is not captured.** Pass `req.log` into the detached executor (INSIGHTS 2026-10-06).
- **R9. Concurrency.** The advisory locks must run on the same `tx` as the writes. A repository call without `tx` inside the transaction commits outside it (onion rule 11).
- **R10. Client traps:**
  - an unknown `?tab=` silently falls back to Config (T23);
  - a namespace missing from `render.tsx`;
  - `@testing-library/user-event` is not installed — use `fireEvent`;
  - fake timers need `act`;
  - `mockFetch` answers only 200/404 — use `vi.stubGlobal` for 409/500;
  - `ErrorState`'s Retry label is hardcoded;
  - long paths need nowrap and ellipsis;
  - Unicode look-alikes in the "−" delta assertions;
  - `pnpm build` while `next dev` runs breaks the dev server.
- **R11. B-NFR-2 timing on testcontainers can be flaky.** The fallback is a manual profile; say so in the report.
- **R12. Nav order.** `registerConventionsNav` pushes to the end, so the eval item must be spliced after `agents`, and the test must check the order after all register calls.
- **R13. `test/reviews.it.test.ts` already fails intermittently** (INSIGHTS 2026-10-01). Do not treat that as a regression from this work.
- **R14. Cascade delete.** Deleting a case removes its `eval_runs` rows, so `GET /eval-runs/:id` shows fewer cases while the stored aggregates stay. This matches A-AC-8 and B-AC-7 ("case deleted").
- **R15. Do not read or copy from `origin/full-functionality`.** Implementers must not check it out or diff against it.

## 10. Handoff

**Do not touch:**
- `reviewer-core/**`
- `server/src/platform/{prompt,grounding,structured}.ts`
- `client/src/vendor/ui/**` (including vendor `nav.ts`)
- `client/src/vendor/shared/**` except T2
- `server/src/vendor/shared/**` except T1
- `server/clones/**` (exclude it from every grep and glob)
- existing migrations (only the newly generated one is edited, as T4 says)
- lockfiles and `node_modules`
- `evals/**`
- `agent_runs` / `run_traces` writes from the eval module

**For `architecture-reviewer`:**
- the eval module does not import `reviews/*` or `agents/*` internals (the copies in `helpers.ts` have parity tests);
- the transaction boundaries in T9 and T14;
- `schema.response` on all 7 routes;
- `container.llmSingleShot`;
- `app.ts` calling `EvalService` at boot.

**For security review (no agent does it; the main session):**
- 404 for foreign ids on every route;
- rate limits;
- untrusted diff, title and body reach the model only through the existing prompt assembly;
- error texts cut to 300 chars with no keys;
- plain-text rendering of case names, findings and prompts.

**`plan-verifier`:** check §8 row by row, and run `pnpm verify:l06` with and without Docker.

**After finishing:** the main session runs the `engineering-insights` skill. Candidates:
1. `eval_runs` is per case while the existing `EvalRun` contract is suite-level. Where the suite lives (`eval_suite_runs`) and why `EvalRun` / `EvalDashboard` stay unused. Goes in root `INSIGHTS.md`, because it is a shared contract.
2. A review prompt cannot be rebuilt from an agent version, because repo-intel, project context and intent are read live and skill links are not versioned. The eval therefore freezes only the diff and PR meta. Goes in `server/INSIGHTS.md`.
3. Also worth recording: `reviewPullRequest` sends only `maxRetries` and `sessionId` to `completeStructured`, and `OpenRouterProvider` ignores `req.timeoutMs` (its SDK client retries twice by default). A strict single call needs constructor options plus a request wrapper. Goes in `server/INSIGHTS.md`; it also concerns `reviewer-core`.

Relevant paths:
- `/Users/oleksandra/dev-digest/specs/2026-10-12-eval-cases-and-scoring.md`
- `/Users/oleksandra/dev-digest/specs/2026-10-12-eval-run-history-compare.md`
- `/Users/oleksandra/dev-digest/server/src/db/schema/eval.ts`
- `/Users/oleksandra/dev-digest/server/src/vendor/shared/contracts/eval-ci.ts`
- `/Users/oleksandra/dev-digest/server/src/vendor/shared/contracts/knowledge.ts`
- `/Users/oleksandra/dev-digest/reviewer-core/src/review/run.ts`
- `/Users/oleksandra/dev-digest/reviewer-core/src/llm/openrouter.ts`
- `/Users/oleksandra/dev-digest/server/src/platform/container.ts`
- `/Users/oleksandra/dev-digest/server/src/adapters/mocks.ts`
- `/Users/oleksandra/dev-digest/server/test/helpers/pg.ts`
- `/Users/oleksandra/dev-digest/server/src/app.ts`
- `/Users/oleksandra/dev-digest/client/src/components/finding-card/FindingCard.tsx`
- `/Users/oleksandra/dev-digest/client/src/components/app-shell/nav.ts`
- `/Users/oleksandra/dev-digest/client/src/app/agents/[id]/_components/AgentEditor/constants.ts`
- `/Users/oleksandra/dev-digest/client/src/test/render.tsx`
- `/Users/oleksandra/dev-digest/client/messages/en/eval.json`
