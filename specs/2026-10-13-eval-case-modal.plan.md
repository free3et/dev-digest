# Implementation Plan: EvalCaseModal — review an eval case before saving

Spec: `specs/2026-10-13-eval-case-modal.md` · Spec ID: SPEC-2026-10-13-eval-case-modal · Spec status: approved (2026-10-13) · Mode: single · Packages: server (incl. `@devdigest/shared`), client

Adds to `specs/2026-10-12-eval-pipeline.plan.md` (Spec A + B). Task numbering continues at T30. AC IDs without a prefix are Spec C; Spec A items are written `A-AC-n`. Produced by `implementation-planner` (pass 2), saved here by the main session.

## 1. Decisions

- **Reuse, no duplicated logic:** `buildSingleFileDiff`, `buildCaseName`, `buildExpectation`, `matches`, `scoreCase` (helpers); `runCase` (+ `guardProvider`) and `describeCaseError` (case-runner); `container.llmSingleShot` via `EvalServiceDeps.llmSingleShot`.
- **One derivation path:** draft, dry-run and create all derive their input through one private service step `deriveCase`, so AC-1 ("draft = bodiless save") holds by construction.
- **Placement:** modal has one consumer → nested at `client/src/components/finding-card/EvalCaseControl/EvalCaseModal/`.
- **A11y:** vendored `Modal` used as is, wrapped app-side by a colocated hook `useDialogA11y` (Escape, Tab trap, initial focus on Name, focus return, `aria-labelledby` set via ref). Input tabs are native `role="tablist|tab|tabpanel"` buttons (vendored `Tabs` has no roles). Vendor files are NOT edited.
- **P1** dry-run body has a named contract `EvalDryRunRequest`. **P2** `matched_count` = `kept.filter(f => matches(f, expectation)).length` for both kinds (not `scoreCase.matching_kept`, which is 0 for must_not_flag). **P3** AC-6 timeout is tested hermetically with fake timers (`eval-dry-run.test.ts`), not in the DB it-test. **P4** remove the dead create-error path (`evalCaseErrorKey`, `EVAL_CASE_ERROR_KEYS`, `prReview.finding.evalCase.{creating,errors.*}`) after `rg` shows no other call site. **P5** new it-tests get their own fixture module `server/test/helpers/eval-fixtures.ts` (copy of `eval-cases.it.test.ts:40-121`); `eval-cases.it.test.ts` stays untouched as AC-8 evidence.
- **R1 resolution (main-session decision, 2026-10-13):** `EvalExpectationInput` caps title/severity/category at 500 and file at 1000, `Finding.title` is uncapped → draft serialization could 500. Resolve at the single derivation point: `buildExpectation` truncates `title` to 500 chars (with `…`) so draft, dry-run and bodiless save all carry the same value. Pathological only; unit-test it. `file` > 1000 is not realistic (path) — leave.

## 2. Architecture constraints

**Server (onion):** routes thin (params/body/`schema.response` from shared, one service call; rate limit + `bodyLimit` in route options). No `drizzle-orm` outside `repository.ts`; no new repo method (reuse `getFindingScope`, `findCaseBySourceFinding`, optional `tx`). R-3 rules, draft builder, dry-run mapping, log line are pure functions in `helpers.ts`. Save keeps the existing transaction + `lockFinding`; `kind_mismatch` is computed from the kind read under the lock (EC-6). Dry-run: no transaction, no insert, no `runBus`, no `agent_runs`/`run_traces`. No imports from `reviews/*` or `agents/*` (agents via `deps.agents`).

**Client:** no `fetch` in components; hooks in `src/lib/hooks/eval.ts`; modal state in local `useState` (unmounts on close → AC-21); server state in TanStack Query; pure logic in `EvalCaseModal/helpers.ts`; strings only via `eval.caseEditor.*`.

## 3. Contract changes (server first, then byte-identical client copy)

`knowledge.ts`: **new** `EvalExpectationInput` (`.strict()` then `.refine(end_line ≥ start_line, path ['end_line'])`; `kind`, `file` 1–1000, `start_line`/`end_line` int ≥ 1, `title`/`severity`/`category` ≤ 500); **new** `EvalCaseOverrides` (`.strict()`; `name?: z.string().trim().min(1).max(500)`, `expected_output?: EvalExpectationInput`); **new** `EvalCaseDraft` (`finding_id`, `agent_id`, `name`, `input_diff`, `input_files`, `input_meta: EvalCaseMeta`, `expected_output: EvalExpectationInput`).
`eval-ci.ts`: **new** `EvalDryRunRequest` (`.strict()`, `{expected_output?: EvalExpectationInput}`); **new** `EvalDryRunResult` (`outcome`, `pass` nullable, `expectation_kind`, `matched` nullable, `matched_count` nullable, `findings_kept`/`findings_dropped` nullable, `kept: Finding[]`, `dropped: {finding, reason}[]`, `duration_ms` int, `cost_usd` nullable, `agent_version` int, `error` nullable). Follow the exact field list in the spec's Contracts section. Order: `.strict()` before `.refine()`, `.trim()` before `.min/.max`. No migration.

## 4. Tasks

"check-pkg" = `scripts/check-pkg.sh <pkg> <files>`; "it" = `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run <file>`.

| # | Pkg | Work | Files | AC | Test |
|---|---|---|---|---|---|
| T30 | server shared | Add contracts of §3 + fixtures | `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `server/test/eval-contracts.test.ts` | support AC-7/9/13, NFR-4 | `eval-contracts.test.ts`: EvalExpectationInput round-trip; rejects `source`, `end_line<start_line`, `start_line:0`, 1001-char file, 501-char title; EvalCaseOverrides: `{}` ok, `"  x  "`→`"x"`, `"   "` fails, 501 name fails, each of `input_diff`/`input_meta`/`input_files`/`owner_id`/`source`/`notes` fails; EvalCaseDraft and EvalDryRunResult (passed/failed/error) round-trip |
| T31 | client vendor | Copy both files whole; `diff -q` empty | `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts` | support | parity case `eval-contracts.test.ts:353` |
| T32 | server | Constants + pure helpers | `modules/eval/{constants,helpers,types}.ts`, `test/eval-draft-helpers.test.ts` | AC-1, 4, 6, 7, 9, NFR-7 | see below |
| T33 | server | Service: `deriveCase`, draft, dry-run, create with overrides | `modules/eval/service.ts`, `test/eval-dry-run.test.ts` | AC-1…9, NFR-2, NFR-7 | hermetic + T35 |
| T34 | server | Routes | `modules/eval/routes.ts` | AC-1, 2, 7, 8, 9, NFR-3, 4 | T35 |
| T35 | server | it-test | `test/helpers/eval-fixtures.ts`, `test/eval-case-modal.it.test.ts` | AC-1…9, NFR-3, 4, 7 | itself + `eval-cases.it.test.ts` unchanged |
| T36 | client | Hooks | `lib/hooks/eval.ts`, `eval.test.tsx` | support AC-10/15/18/21 | `eval.test.tsx` |
| T37 | client | i18n keys | `messages/en/eval.json` | NFR-6 | component tests |
| T38 | client | Modal pure helpers | `.../EvalCaseModal/{helpers.ts,helpers.test.ts,constants.ts}` | AC-11–14, 16, 17, 19 | `helpers.test.ts` |
| T39 | client | `useDialogA11y` | `.../EvalCaseModal/hooks/useDialogA11y.ts` | AC-20, NFR-5 | in T40 test |
| T40 | client | `EvalCaseModal` component | `.../EvalCaseModal/{EvalCaseModal.tsx,index.ts,styles.ts,EvalCaseModal.test.tsx}`, `InputTabs/`, `RunResult/` | AC-11–17, 19, 21, NFR-1, 5, 6 | `EvalCaseModal.test.tsx` |
| T41 | client | Wire the card; remove dead create-error path (P4) | `EvalCaseControl/{EvalCaseControl.tsx,helpers.ts,helpers.test.ts,EvalCaseControl.test.tsx}`, `messages/en/prReview.json` | AC-10, 18, 20, 21 | `EvalCaseControl.test.tsx`, `FindingCard.test.tsx` |
| T42 | docs | Update docs | `server/docs/eval.md`, `client/docs/eval-ui.md`, `server/README.md`, `client/README.md` | support | review |

### Details

**T32.** Constants `EVAL_DRY_RUN_RATE_LIMIT = 10`, `EVAL_BODY_LIMIT_BYTES = 16_384`. Pure helpers: `toExpectationInput(e)` drops `source`; `buildCaseDraft(scope, kind, agentId)` using `buildCaseName`/`buildSingleFileDiff`/`buildExpectation` then `toExpectationInput` (only place derived values come from); `expectationRefusal(input, draft, currentKind)` → `'file_not_in_diff'` when `input.file !== draft.input_files[0]`, then `'kind_mismatch'` when `input.kind !== currentKind`, else null (in that order); `withServerSource(input, derived)`; `toDryRunResult(result, expectation, costUsd, durationMs, agentVersion)` (P2; on `outcome:error` null counts, empty lists, `cost_usd:null`); `dryRunLogLine(findingId, outcome, costUsd, ms)` = `eval dry-run finding <id>: <outcome>, cost <$x.xxxx|n/a>, <ms> ms`. `types.ts`: `DerivedCase {scope, kind, agent, draft, expectation}`. Also title truncation in `buildExpectation` (R1). Tests: draft = buildExpectation minus source, name = buildCaseName; each refusal in order; narrowed range → failed for must_find; override vs derived give different outcomes on same findings; `matched_count` on must_not_flag > 0 when a kept finding matches; exact log line; long-title truncation.

**T33.** Extract private `deriveCase(ws, findingId, tx?)` from `createCaseFromFinding` (R-1 in the current order: not_found → finding_undecided → no_agent → duplicate(+`case_id`) → patch_unavailable; messages byte-identical). `getCaseDraft(ws,id)`: deriveCase w/o tx, no write, no lock. `createCaseFromFinding(ws,id,overrides?)`: inside the existing transaction+lock `deriveCase(ws,id,tx)`; if `overrides.expected_output` → `expectationRefusal` → `AppError(code, …, 422)`; name = `overrides.name ?? draft.name`; expectedOutput = `withServerSource(override, expectation)` or `expectation`; inputs/agentId from draft; no body or `{}` = exact Spec A row (AC-8). `dryRunCase(ws,id,body,log?)`: deriveCase (no tx); R-3 check; skills = `agents.enabledSkillsForPrompt(agent.id)` mapped via `evalSkillBlock`; `try { llm = await deps.llmSingleShot(agent.provider, {timeoutMs: EVAL_CASE_TIMEOUT_MS}) } catch (e) { result = errorCase(kind, describeCaseError(e)) }` (missing key → 200 outcome error, not 500); else `runCase({systemPrompt, model, skills, llm, evalCase:{input_diff, input_meta, expected_output: override ?? derived}, timeoutMs: deps.caseTimeoutMs})`; `toDryRunResult(..., agent.version)`; `log?.info({...}, dryRunLogLine(...))`. expected_output is used only for scoring, never in the prompt. Deps: optional `caseTimeoutMs?` (test seam). Hermetic `eval-dry-run.test.ts` builds `EvalService` with stub repo/agents: never-resolving `structuredFn` + `vi.useFakeTimers()` → `outcome:error` "timed out after 60 s (the call may still be billed)"; thrown `Error('bad sk-abcdefghijk123')` redacted; `llmSingleShot` rejecting with `ConfigError` → error result; R-1/R-3 refusal → 0 `structuredFn` calls.

**T34.** `GET /findings/:id/eval-case/draft` (`params: IdParams`, `response:{200: EvalCaseDraft}`); `POST /findings/:id/eval-case/dry-run` (`body: EvalDryRunRequest.optional()`, `response:{200: EvalDryRunResult}`, rate limit `EVAL_DRY_RUN_RATE_LIMIT`/min, `bodyLimit: EVAL_BODY_LIMIT_BYTES`, passes `req.log`); `POST /findings/:id/eval-case` adds `body: EvalCaseOverrides.optional()` + `bodyLimit`, rate limit stays 30. Update route comment block. No hand-rolled `.parse`.

**T35.** Scripted `MockLLMProvider` overriding all three providers. Cases: AC-1 draft vs created case, row counts of eval_cases/eval_runs/eval_suite_runs unchanged by GET; AC-2 one call, request has `maxRetries:0`, `maxTokens:4096`, `timeoutMs:60000`; AC-3 prompt contains stored-patch diff + PR title/body, `PUT /agents/:id` changes prompt and next dry-run carries it with new `agent_version`, none of `## Repo skeleton`, `## Callers of changed symbols`, `## Project context`, `## Stated intent`, `## Relevant memory`, an enabled skill's `### name` present; AC-4 matching finding → passed, `matched_count:1`, narrowed range → failed; AC-5 counts of eval_cases/eval_runs/eval_suite_runs/agent_runs/run_traces before/after for passed/failed/errored, `runBus.publish` spy 0 calls; AC-6 openrouter agent, no override, empty secrets → 200 `outcome:error`, `pass:null`, `cost_usd:null`; `sk-…` redacted; AC-7 save with edited name + narrowed range, row has supplied values, `source.finding_id`, inputs = draft's; AC-8 `{}` and no payload give equal rows (except id); AC-9 every R-1 row on all three endpoints (+duplicate `case_id`), `input_diff` in body → 422 `validation_error`, other file → 422 `file_not_in_diff`, finding flipped → 422 `kind_mismatch` on save and dry-run, mock count 0, nothing stored; NFR-3 app `nodeEnv:'development'`, 11th dry-run/min → 429, mock count 10; NFR-4 foreign workspace → 404 ×3, 17 KB → 413 on dry-run and create, sentinel in `name`/`expected_output.title` never in a captured request; NFR-7 log line via `app.log.child` wrapper (as `eval-runs.it.test.ts:317-326`).

**T36.** `useEvalCaseDraft(findingId|null)`: key `["eval-case-draft", id]`, `enabled: !!id`, `staleTime:0`, `gcTime:0`, `retry:false`. `useEvalDryRun(findingId)`: mutation posting `{expected_output}`; no invalidation. `useCreateEvalCase(agentId)`: `mutationFn({findingId, overrides})`; keep invalidation of `["eval-cases", agentId]`. `import type` from shared. Tests: draft GET path, dry-run POST body, create body + invalidation, existing create test updated.

**T37 (keys in `eval.json` `caseEditor.*`).** Reuse staged: `caseTitle, runCase, running, save, saving, nameLabel, inputLabel, tabs.diff, tabs.prMeta, expectedOutput, validJson, invalidJson, lastRunPassed, lastRunFailed`. Add: `tabs.files`, `tabsLabel`, `subtitle.{mustFind,mustNotFlag}` ("Seeded from an accepted/dismissed finding · assert the expected output"), `banner.{mustFind,mustNotFlag}` ("POSITIVE CASE · MUST find {title} at {file}:{line}" / "NEGATIVE CASE · MUST NOT flag …"), `findingSkeleton`, `cancel`, `costHint` ("Runs the agent once (one paid model call)"), `loadingDraft`, `prMeta.{number,title,repo,body,noBody}`, `json.{parse,shape,unknownKey,range,fileMismatch,kindMismatch}`, `saveBlocked.{name,json}`, `result.{lastRunErrored,expectedMustFind,expectedMustNotFlag,kept,dropped,duration,cost}` ("expected ≥ 1 matching finding, got {count}" / "expected 0 matching findings, got {count}"), `errors.{finding_undecided,no_agent,duplicate,patch_unavailable,not_found,validation_error,file_not_in_diff,kind_mismatch,rate_limited,payload_too_large,network_error,unknown}` (kind_mismatch: "…close and reopen the modal"). Assert "≥" and "·" literally.

**T38.** `validateExpectationText(text, draft)`: `JSON.parse` failure → `parse`; else `EvalExpectationInput.safeParse` (value import from `@devdigest/shared`); first issue → `unknownKey` / `range` / `shape`; then `fileMismatch` vs `input_files[0]`, `kindMismatch` vs `draft.expected_output.kind`; returns `{ok:true,value}|{ok:false,reason,params}`. `toJsonText`, `bannerKey`, `subtitleKey`, `saveBlockReason(name, validity)` (`'name'|'json'|null`, name trimmed), `resultView(result)` (keys+params; seconds 1 decimal; cost via `formatCostUsd`, `EMPTY` when null), `modalErrorKey(err)` (ApiError.code for R-1/R-3; 429 → `rate_limited`; 413 → `payload_too_large`; status 0/non-ApiError → `network_error`; else `unknown`). Unit-test every branch.

**T39.** `useDialogA11y({containerRef, labelId, initialFocusRef, onClose})`: on mount remember `document.activeElement`, set `aria-labelledby` on `[role="dialog"]`, focus initial; keydown: Escape → `onClose`, Tab/Shift+Tab wrap; on unmount restore focus if still connected.

**T40.** Props `{findingId, agentId, onClose, onSaved}`. Layout in vendored `Modal` wrapped by the a11y hook: kind banner (text, ellipsis); Name = native `<input required>` with `useId` + `<label>`; `InputTabs` (Diff = `<pre>` plain text scrolling inside the panel; Files list; PR meta number/title/repo/body or `prMeta.noBody`; nothing editable); Expected output = native labelled `<textarea>` + badge text + reason; `findingSkeleton` button (resets to derived expectation); `RunResult`; footer Cancel, `costHint` beside Run case, Save. States: loading (Run/Save disabled); draft error (reason text, only Cancel enabled — AC-12); Run enabled only when JSON valid and not pending, calls `mutate` once (AC-15); Save enabled when `saveBlockReason` null, sends `{name: name.trim(), expected_output: parsed}`, on success `onSaved()`, on error shows `modalErrorKey` text and keeps edits (AC-19). Tests: all AC-11…17, 19 Verify bullets; `<script>` PR body renders literally; Save works with no prior Run; focus on Name after open; Tab wrap both directions; dialog accessible name "Eval case · <name>"; cost hint present. Stub fetch with `vi.stubGlobal` for 409/422/429/network; deferred promise for in-flight dry-run; `fireEvent` only.

**T41.** `EvalCaseControl`: button sets `open` (no request); renders `<EvalCaseModal>` while open; `onClose` → close; `onSaved` → close (existing `["eval-cases", agentId]` invalidation yields the "In eval set" link; Spec A AC-5 states/labels unchanged). Remove `create.mutate`, the inline error, `evalCaseErrorKey`/`EVAL_CASE_ERROR_KEYS` and their tests; remove `prReview.finding.evalCase.creating` and `.errors.*` only after `rg "finding.evalCase.(creating|errors)" client/src` shows only removed sites. Tests: AC-10 click shows dialog; fetch log has one GET `…/eval-case/draft`, no POST; AC-18 exact body `{name, expected_output}`, dialog gone and link shown after 201 + refetch, Save during pending dry-run also closes; AC-20 Cancel, X (`getByRole('button',{name:'Close'})`), Escape, backdrop (vendored Modal's first child div via `container.querySelector`, comment why) → no POST, button still shown; AC-21 open, edit, Run (pending), Cancel, resolve stub, reopen → no result box, fields equal the new draft.

**T42 docs.** `server/docs/eval.md`: routes table (+draft, +dry-run, create body `EvalCaseOverrides`, refusals R-1, R-3, 413, 429), rate limits (dry-run 10/min, bodyLimit 16 KB), section "Draft and dry-run (Spec C)" (shared derivation, R-3 order, reuse of runCase/llmSingleShot, one call, writes nothing, missing key → 200 outcome error, log line, `matched_count` semantics, timed-out call may be billed), note in "Frozen input" that name/expected_output may be user-supplied at first save while source/inputs are server-built, link Spec C. `client/docs/eval-ui.md`: mermaid CARD → EvalCaseModal → GET draft / POST dry-run / POST create; hooks table; rewrite FindingCard section; a11y wrapper explained; Sources +Spec C. `server/README.md` (:84 eval node, §Eval) and `client/README.md` (:41 edge label, :50 modal mention).

## 5. Execution

W0 baseline (`scripts/check-all.sh`) → W1 T30→T31 → W2 server T32→T33→T34→T35 ‖ W3 client hook T36→T37 → W4 T38→T39→T40 → W5 T41 → W6 verification (main session; test-writer if gaps; architecture-reviewer; plan-verifier) → W7 T42 docs. Suggested commits: contracts; server; client hooks+i18n; modal; card wiring; docs.

## 6. Test plan

Per task `scripts/check-pkg.sh`; per package at end `scripts/check-pkg.sh server|client`. Server DB-backed: `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run test/eval-case-modal.it.test.ts test/eval-cases.it.test.ts test/eval-runs.it.test.ts` (catches `deriveCase` regressions). `pnpm verify:l06` must be green with Docker and fail without (`DOCKER_HOST=unix:///nonexistent`); filter `test/eval-` already includes new files. Client: `cd client && pnpm test`, then `pnpm build` only with `next dev` stopped. Manual NFR-1: one paid demo dry-run (≤ $0.01), only with explicit user approval. Not run: e2e, `evals/`.

## 7. Coverage matrix

| AC / NFR | Tasks | Tests |
|---|---|---|
| AC-1 | T32–34 | eval-draft-helpers; eval-case-modal.it (draft = created case; counts unchanged) |
| AC-2 | T33–34 | eval-case-modal.it (1 call; maxRetries 0, maxTokens 4096, timeoutMs 60000) |
| AC-3 | T33 | eval-case-modal.it (diff/title/body, new prompt + agent_version, excluded headings absent) |
| AC-4 | T32–33 | eval-draft-helpers; eval-case-modal.it |
| AC-5 | T33 | eval-case-modal.it (5 table counts × 3 outcomes; runBus 0) |
| AC-6 | T32–33 | eval-dry-run (fake-timer timeout); eval-case-modal.it (no-key 200 error; redaction) |
| AC-7 | T30, 32–34 | eval-case-modal.it |
| AC-8 | T33–34 | eval-cases.it (unchanged); eval-case-modal.it |
| AC-9 | T30, 32–34 | eval-contracts; eval-draft-helpers; eval-dry-run; eval-case-modal.it |
| AC-10 | T36, 41 | EvalCaseControl.test |
| AC-11 | T37, 38, 40 | EvalCaseModal.test; helpers.test |
| AC-12 | T38, 40 | EvalCaseModal.test |
| AC-13 | T30, 38, 40 | helpers.test; EvalCaseModal.test |
| AC-14 | T38, 40 | EvalCaseModal.test |
| AC-15 | T36, 40 | EvalCaseModal.test |
| AC-16 | T38, 40 | helpers.test; EvalCaseModal.test |
| AC-17 | T38, 40 | helpers.test; EvalCaseModal.test |
| AC-18 | T36, 41 | EvalCaseControl.test |
| AC-19 | T38, 40 | EvalCaseModal.test |
| AC-20 | T39, 41 | EvalCaseControl.test |
| AC-21 | T36, 40, 41 | EvalCaseControl.test |
| NFR-1 | T37, 40 | EvalCaseModal.test; manual cost reading (user-gated) |
| NFR-2 | T33 | eval-dry-run |
| NFR-3 | T32, 34 | eval-case-modal.it (11th → 429) |
| NFR-4 | T30, 34 | eval-contracts; eval-case-modal.it |
| NFR-5 | T39, 40 | EvalCaseModal.test |
| NFR-6 | T37 | all component tests |
| NFR-7 | T32, 33 | eval-draft-helpers; eval-case-modal.it |
| NFR-8 | T35 | `pnpm verify:l06` with/without Docker; `cd client && pnpm test` |

## 8. Risks and traps

- **R1** long titles → resolved by truncation in `buildExpectation` (see §1).
- **R2** strict single-shot holds only for `openrouter` (openai/anthropic keep transport retries); AC-2 asserted at request level.
- **R3** cancelled/timed-out dry-run may still be billed (no abort signal); accepted (NFR-2, NG-7); client only discards the result.
- **R4** rate limiter is inert under `nodeEnv:'test'` → 429 case needs a `development` app and 10 mocked successes first.
- **R5** `ConfigError` from `llmSingleShot` throws before `runCase` → `dryRunCase` must catch it (as `suite-executor.ts:68-75`); only R-1/R-3 refusals may escape as `AppError`.
- **R6** real paid calls in tests if a provider has no override → override all three; sole exception is the deliberate no-key case with empty secrets.
- **R7** log line on `app.log` is not captured → pass `req.log`, use the `app.log.child` wrapper.
- **R8** optional bodies: `inject` without payload vs `{}` vs empty JSON body behave differently (empty JSON body = Fastify 400, not a spec case); `api.post` sends a body only when truthy.
- **R9** 413 keeps `code: internal_error` in the generic handler → client maps by status.
- **R10** fake timers don't mix with testcontainers Postgres client → timeout case is hermetic (P3).
- **R11** vendored Modal/Tabs lack a11y → ref-based wrapper, native role buttons; never edit `client/src/vendor/ui/**`; focus return after save has no target (button becomes link) — not required.
- **R12** zod order: `.strict()` before `.refine()`, `.trim()` before `.min/.max`.
- **R13** EC-6 race: `kind_mismatch` from the kind read under the finding lock inside the transaction, never from the client's draft.
- **R14** `deriveCase` refactor can change R-1 order/messages → rerun `eval-cases.it` and `eval-runs.it` unchanged.
- **R15** client test traps: `mockFetch` answers only 200/404 (use `vi.stubGlobal`); no `user-event` (use `fireEvent`); `≥`/`·` look-alikes; missing i18n key throws in tests; long paths need `nowrap` + ellipsis.
- **R16** value import of `EvalExpectationInput` in client → verify with `pnpm build`, only while `next dev` is stopped.
- **R17** `test/reviews.it.test.ts` is flaky on a clean tree — not a regression from this work.
- **R18** dry-run response carries full kept/dropped findings (untrusted LLM text) → modal renders counts only (NG-6) and error text as plain text.

## 9. Handoff

**Do not touch:** `reviewer-core/**`; `server/src/platform/{prompt,grounding,structured}.ts`, `container.ts`; `client/src/vendor/ui/**`; `**/src/vendor/shared/**` except T30/T31; migrations, DB schema, lockfiles, `node_modules`, `server/clones/**`, `evals/**`; `server/test/eval-cases.it.test.ts`; Spec A body (amendment markers already present at NG-2 and C-15).

**architecture-reviewer checks:** routes thin with body schemas and `schema.response` on all three routes; `deriveCase` is the only derivation path; dry-run has no repo write/transaction/runBus; `kind_mismatch` checked inside the save transaction; no `reviews/*`/`agents/*` imports; client: modal nested under `EvalCaseControl`, no `fetch` in components, a11y hook colocated.

**Security review (main session):** foreign-id 404, `.strict()` vs mass assignment, 16 KB bodyLimit, dry-run 10/min, caller text never reaches the model (NFR-4 sentinel), error text redacted and ≤ 300 chars, plain-text rendering of diff/PR body/names/errors.

**INSIGHTS candidates:** vendored `Modal`/`Tabs` lack Escape, focus trap, `aria-labelledby`, tab roles (ref-based wrapper); `ConfigError` from `llmSingleShot` throws before `runCase` so each new caller must map it; `Tabs` has no `role="tab"` so RTL `getByRole("tab")` fails.
