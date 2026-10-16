# Implementation Plan: Eval compare dialog, regression banner and recent runs across agents

Spec: `specs/2026-10-13-eval-dashboard-compare-polish.md` · Spec ID: SPEC-2026-10-13-eval-dashboard-compare-polish · Spec status: approved (free3et, 2026-10-13) · Mode: single · Packages: server (incl. `@devdigest/shared`), client

Adds to `specs/2026-10-12-eval-pipeline.plan.md` (Spec A+B) and `specs/2026-10-13-eval-case-modal.plan.md` (Spec C). Numbering continues at T43. AC IDs without prefix are Spec D; Spec B items `B-AC-n`, Spec C `C-AC-n`. Produced by `implementation-planner` (pass 2); saved by the main session.

## 1. Decisions

- **P1 Contracts.** In `eval-ci.ts` add `EvalRecentRunsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) })` and `EvalRecentRun = EvalSuiteRun.extend({ agent_name: z.string() })`. `status` not narrowed (the finished filter is the repository's job). Query not `.strict()`.
- **P2 Server layering.** `routes.ts`: `querystring: EvalRecentRunsQuery`, `response: {200: z.array(EvalRecentRun)}` → `service.recentRuns(ws, req.query.limit)`; service maps rows with pure `toEvalRecentRun` in `helpers.ts`; repository `listRecentFinishedSuites(ws, limit, tx?)` is the only Drizzle code. No transaction, no new constant, no migration, no index, no per-route rate limit.
- **P3 One delta rule (EC-19).** In `client/src/lib/format.ts`: `toPercent(v)` = `round(v*100)` or null; `metricDelta(a,b)` = `b−a` rounded to 6 dp or null (moves here from `EvalCompare/helpers.ts`); `pointDelta(d)` → `{direction:'up'|'down'|'flat', points, belowOne}` or null (`points = round(|d|*100)`; `belowOne` when `d≠0` and points is 0). Banner, tiles and dashboard all go through `pointDelta`. `formatMetric`/`formatSignedDelta` are deleted once their 3 call sites (`EvalDashboard.tsx`, `EvalRunHistory.tsx`, `CompareMetrics.tsx`) switch (T64). `MINUS` stays.
- **P4 Shared rendering.** New `client/src/components/eval-metric/`: `MetricPercent` ("{value}%" or `EMPTY`), `PointDelta` (`<span role="img" aria-label="up 4 pt">▲ 4 pt</span>`; flat "0 pt" no glyph; null `EMPTY`). Strings in `eval.metricFormat.*`.
- **P5 Promote `useDialogA11y`** from `client/src/components/finding-card/EvalCaseControl/EvalCaseModal/hooks/useDialogA11y.ts` to `client/src/lib/hooks/dialog-a11y.ts` (export name unchanged, logic byte-identical, header comment says it's shared by EvalCaseModal and EvalCompare). Delete the old file/folder. Do not add to the `lib/hooks/index.ts` barrel. EvalCaseModal/EvalCaseControl tests must pass UNCHANGED.
- **P6 Compare dialog.** `EvalCompare` keeps props `{agentId, runIds, onClose}`, becomes `createPortal(<div ref>…<Modal width={980}>…</Modal></div>, document.body)` (same pattern as `EvalCaseModal.tsx`). `labelId` = title span id rendered from first render (text changes in place); `initialFocusRef` = footer Close button (check `Button` forwards `ref`, else wrap); `ready` = both runs loaded. Metric rows of `CompareMetrics` are removed; folder renamed `CompareRunInfo/` (ran_at/version/skills). New `CompareTiles/` holds 4 tiles.
- **P7 `costDelta(a,b)`** in `EvalCompare/helpers.ts`: null if either null; else `d` rounded to 6 dp; `d===0` → `{direction:'flat', text:"$0.00"}`; else `{direction, cost: formatCostUsd(|d|)}`; strings `metricFormat.costUp` "▲ +{cost}", `costDown` "▼ −{cost}" (U+2212).
- **P8** `sameCaseSet` + new `isFinished(run)` promoted to `EvalsTab/helpers.ts`; `EvalRunHistory/helpers.isSelectable` delegates to `isFinished`.
- **P9** `useEvalRecentRuns(limit = 10)` key `["eval-dashboard","recent-runs",limit]` (existing `invalidateQueries({queryKey:["eval-dashboard"]})` matches by prefix); no polling.
- **P10** Regression banner in `EvalsTab/RegressionBanner/`, uses `useAgentEvalRuns(agentId)` (same key as history, deduped); pure `regressionBanner(runs)`.
- **P11** `EvalDashboard/RecentRuns/` nested; rendered after the agent-table body inside `EvalDashboard` with own query/states (EC-18).
- **Spec wording note:** AC-13 says "citation accuracy", AC-14's literal is "Recall and citation both up." — use metric name "citation" in both sentences.
- **No "amended by Spec D" marker in Spec B** (C-8).

## 2. Architecture constraints

Server (onion): routes transport-only; drizzle/`db/schema` only in `repository.ts`; row→DTO in `helpers.ts`; no `agents/*` import (agents table joined in the eval repository like `dashboardInputs`). Client: no `fetch` in components; hooks in `lib/hooks/eval.ts`; pure code in `helpers.ts`/`lib/format.ts`; `lib/` never imports `components/`/`app/`; `dialog-a11y.ts` imports only React; shared `components/eval-metric/` imports no route code; nested folders for single-consumer parts; strings only in `messages/en/eval.json`; vendored `@devdigest/ui` untouched (NG-10).

## 3. Contract changes

Server `eval-ci.ts` after `EvalDashboardRow`: `EvalRecentRunsQuery`, `EvalRecentRun` with doc comments (finished only, `agent_name` is current name, metrics nullable). `EvalDashboard`/`EvalTrendPoint` unchanged. Client copy byte-identical (parity test `eval-contracts.test.ts` ~:487 enforces). No migration.

## 4. Tasks

"check-pkg" = `scripts/check-pkg.sh <pkg> <files>`; "it" = `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run <file>`; `…/EvalsTab/` = `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/`.

| # | Pkg | Work | Files | AC | Test |
|---|---|---|---|---|---|
| T43 | server shared | add `EvalRecentRunsQuery`, `EvalRecentRun` | `server/src/vendor/shared/contracts/eval-ci.ts`, `server/test/eval-contracts.test.ts` | AC-1..3, NFR-5 | query `{}`→`{limit:10}`; `"3"`→3; `"50"` ok; `"0"`,`"51"`,`"abc"`,`"2.5"`,`""` fail; `EvalRecentRun` round-trip with nulls; missing `agent_name` fails |
| T44 | client vendor | copy server `eval-ci.ts` whole | `client/src/vendor/shared/contracts/eval-ci.ts` | NFR-5 | parity test + `cmp` |
| T45 | server | pure `toEvalRecentRun(row, agentName)` = `{...toEvalSuiteRun(row), agent_name}` | `modules/eval/helpers.ts`, `test/eval-helpers.test.ts` | AC-1 | carries every field + agent_name; nulls kept |
| T46 | server | repo `listRecentFinishedSuites(workspaceId, limit, tx?)` → `{suite, agentName}[]` | `modules/eval/repository.ts` | AC-1,2, NFR-2,3 | T49 |
| T47 | server | service `recentRuns(ws, limit)` | `modules/eval/service.ts` | AC-1,2 | T49 |
| T48 | server | route `GET /eval/recent-runs` after `/eval/dashboard`; update comment block | `modules/eval/routes.ts` | AC-1..3, NFR-3,4 | T49 |
| T49 | server | DB it-test, own container + `startPg()` (copy `makeAgent`/`addSuites` from `eval-history.it.test.ts:57-107`; no cross-file import) | `server/test/eval-recent-runs.it.test.ts` | AC-1..3, NFR-3,4,7 | cases below |
| T50 | client | promote `useDialogA11y` (P5), update EvalCaseModal import | `client/src/lib/hooks/dialog-a11y.ts`, `…/EvalCaseModal/EvalCaseModal.tsx`, delete old hook | C-3, NFR-1 | EvalCaseModal/EvalCaseControl tests unchanged |
| T51 | client | `toPercent`, `metricDelta` (moved, 6dp), `pointDelta` | `client/src/lib/format.ts`, `format.test.ts`, `…/EvalCompare/{helpers.ts,helpers.test.ts}` | AC-6,13,21 (EC-19,20) | 0.78→78; 0.784/0.825→78/83 delta 0.041→4 pt; +0.04 up 4; −0.10 down 10; +0.003 up belowOne; 0 flat; 0.8−0.6 → 0.2; null either → null |
| T52 | client | i18n keys (below) | `client/messages/en/eval.json` | NFR-6 | all component tests |
| T53 | client | `MetricPercent` + `PointDelta` | `client/src/components/eval-metric/{EvalMetric.tsx,index.ts,styles.ts,EvalMetric.test.tsx}` | AC-6,21, NFR-1 | "78%","—"; label "up 4 pt" with text "▲ 4 pt"; "down 10 pt"/"▼ 10 pt"; "▲ <1 pt" name "up <1 pt"; flat "0 pt" no glyph; null "—" |
| T54 | client | `useEvalRecentRuns(limit=10)` | `client/src/lib/hooks/eval.ts`, `eval.test.tsx` | AC-17,19 | GET `/eval/recent-runs?limit=10`; invalidating `["eval-dashboard"]` refetches; no polling |
| T55 | client | `costDelta`; promote `sameCaseSet` + `isFinished` to `EvalsTab/helpers.ts` | `…/EvalCompare/{helpers.ts,helpers.test.ts}`, `…/EvalsTab/{helpers.ts,helpers.test.ts}`, `…/EvalRunHistory/helpers.ts` | AC-7,8,15 | 0.04→0.06 up "$0.02"; 0.06→0.05 down "$0.01"; equal flat; null → null; 0 → flat |
| T56 | client | `CompareTiles/` (4 tiles) + rename `CompareMetrics/`→`CompareRunInfo/` w/o metric rows | `…/EvalCompare/CompareTiles/*`, `…/EvalCompare/CompareRunInfo/*` (delete `CompareMetrics/`) | AC-6,7,8 | in T58 |
| T57 | client | PromptDiff legend inside expanded diff: "v{A} (old)" / "v{B} (new)" as text | `…/EvalCompare/PromptDiff/PromptDiff.tsx` | AC-9 | in T58 |
| T58 | client | `EvalCompare` as portalled dialog; error state inside; footer Close | `…/EvalCompare/{EvalCompare.tsx,styles.ts,EvalCompare.test.tsx}` | AC-4..10,12, NFR-1,4 | cases below |
| T59 | client | `RegressionBanner` helper + component | `…/EvalsTab/RegressionBanner/{RegressionBanner.tsx,helpers.ts,helpers.test.ts,index.ts,styles.ts}` | AC-13..16 | cases below |
| T60 | client | `EvalsTab`: history always rendered, banner above, dialog over | `…/EvalsTab/{EvalsTab.tsx,EvalsTab.test.tsx}` | AC-4,11,13,15,16, NFR-1,4 | cases below |
| T61 | client | history metric cells via `MetricPercent` | `…/EvalRunHistory/{EvalRunHistory.tsx,EvalRunHistory.test.tsx}` | AC-20 | "75%" not "0.75"; null "—"; order/disabled/Compare gating unchanged |
| T62 | client | dashboard agent cells `MetricPercent`+`PointDelta` via rich `dashboard.metricWithDelta`; add recent-runs stub to existing tests | `client/src/app/eval/_components/EvalDashboard/{EvalDashboard.tsx,EvalDashboard.test.tsx}` | AC-21, NFR-1 | "50% (▼ 25 pt)", "60% (▲ 10 pt)", "100% (0 pt)", null value "—", null delta "82% (—)"; label "down 25 pt"; drop row first; Retry counts only `/eval/dashboard` |
| T63 | client | `RecentRuns` section | `client/src/app/eval/_components/EvalDashboard/RecentRuns/{RecentRuns.tsx,index.ts,styles.ts,RecentRuns.test.tsx}`, `EvalDashboard.tsx`, `EvalDashboard.test.tsx` | AC-17..19, NFR-1,3,4 | cases below |
| T64 | client | remove dead code: `formatMetric`, `formatSignedDelta` + tests; i18n `compare.back`, `compare.deltaLabel`, other keys `rg` proves unused (keep staged `dashboard.metricTrend`/`dashboard.recentRuns`) | `client/src/lib/{format.ts,format.test.ts}`, `eval.json` | G-5 | `rg "formatMetric\|formatSignedDelta" client/src` empty |
| T65 | docs | update docs (main session / doc-writer) | `server/docs/eval.md`, `client/docs/eval-ui.md`, READMEs, `specs/eval-pipeline.md` ("(draft)"→"(approved)") | support | review |
| T66 | server manual | NFR-2 timing with 5000 suite runs — USER-GATED, never CI | — | NFR-2 | p95 ≤ 300 ms |

### Details

**T46.** `select({suite: getTableColumns(evalSuiteRuns), agentName: agents.name})` from `evalSuiteRuns` `innerJoin(agents, and(eq(agents.id, evalSuiteRuns.agentId), eq(agents.workspaceId, workspaceId)))` (excludes deleted/foreign agents) `where(and(eq(evalSuiteRuns.workspaceId, ws), inArray(status, ['done','partial'])))` `.orderBy(desc(ranAt), desc(id)).limit(limit)`. Style as `listSuitesByAgent` (~repository.ts:348).

**T48.** `app.get('/eval/recent-runs', {schema:{querystring: EvalRecentRunsQuery, response:{200: z.array(EvalRecentRun)}}}, async (req) => service.recentRuns((await getContext(container, req)).workspaceId, req.query.limit))`. No `config.rateLimit`. Comment: `GET /eval/recent-runs?limit= -> EvalRecentRun[] (finished, newest first, 1..50, default 10; 422)`.

**T49 cases.** Own `startPg()`+`seed()` in `beforeAll`; default workspace is shared, so each test seeds `ran_at` later than earlier tests (base + test# × 10_000 min). AC-1: 12 finished (one `partial`) + 1 `running` + 1 `failed` seeded NEWEST (one running per agent: unique partial index); response parses with `z.array(EvalRecentRun)`, exactly 10 items, `ran_at` desc, only done/partial, partial present. Ties: same `ran_at` → `id` desc (assert with sorted ids). Deleted agent: newest run absent after `db.delete(agents)` while row remains. Rename: `agent_name` is new name. AC-2: `limit=3` → 3 newest; `limit=50` ≤ available. AC-3: `0`,`51`,`abc`,`2.5`,`''` → 422 `validation_error` (check error shape against an existing 422 assertion). NFR-3: runs/agents in `foreignWorkspaceId` absent, including a foreign run pointing at a default-workspace agent id. NFR-4: all three `MockLLMProvider.calls.length === 0` after GETs.

**T52 keys** (`eval.json`; literals "·" U+00B7, "→" U+2192, "▲" U+25B2, "▼" U+25BC, "−" U+2212): `metricFormat.{percent "{value}%", pointUp "▲ {points} pt", pointDown "▼ {points} pt", pointFlat "0 pt", lessThanOne, upName "up {points} pt", downName "down {points} pt", flatName "unchanged", costUp "▲ +{cost}", costDown "▼ −{cost}"}`; `compare.{titleWithVersions "Compare runs · v{a} → v{b}", subtitle "Old prompt vs new — metric deltas and prompt diff", close "Close", tiles.{label,recall,precision,citation,cost,values "{a} → {b}"}, legend.{old "v{version} (old)", new "v{version} (new)"}, runInfoHeading}` (keep `title` "Compare runs"); `history.regression.{label, metric.{recall,precision,citation}, metricStart.{…}, dipped "{metric} dipped {points, plural, one {# pt} other {# pts}}", dippedBelowOne "{metric} dipped <1 pt", list2 "{a} and {b}", list3 "{a}, {b} and {c}", dipSentence "{list} on v{version}.", up1 "{a} up.", up2 "{a} and {b} both up.", caseSets "Metrics are over different case sets."}`; `dashboard.recent.{title "Recent eval runs · all agents", empty "No finished eval runs yet.", loading, loadErrorTitle, loadErrorBody, partial "partial", columns.{agent,ranAt,version,recall,precision,citation,passed}}`; `dashboard.metricWithDelta` becomes a rich-text message (`<value></value> (<delta></delta>)`) so cell textContent is exactly "82% (▲ 4 pt)".

**T56.** `CompareTiles({a,b})`: labelled group; metric tile = label + `compare.tiles.values` with `MetricPercent` a/b + `PointDelta(pointDelta(metricDelta(a,b)))`; cost tile = `formatCostUsd(a)` → `formatCostUsd(b)` + `costDelta` text, "—" when either null. Direction is text, never colour alone. `CompareRunInfo` keeps `runA/runB/ranAt/version/skills` rows (ellipsis + title on skills).

**T58.** Title `<span id={titleId} style={ellipsis}>`: "Compare runs" while loading, `titleWithVersions` once loaded; subtitle only when loaded; body: notice, `CompareTiles`, `CompareRunInfo`, `PromptDiff`, cases table; footer `<Button ref={closeRef}>`. Error branch: `ErrorState` Retry → refetch only the failed query; Close still rendered; `ready=false`. Tests (rewrite file; keep `<script>`, ellipsis, same-prompt, same-version, changed-rows-first, case-deleted): AC-4 `screen.getByRole("dialog")` ancestors end at `document.body`, not RTL container; AC-5 name "Compare runs" before stubs resolve (deferred), then "Compare runs · v6 → v7", equal versions "v3 → v3", subtitle; AC-6 "50% → 75%" + label "up 25 pt", "75% → 65%" + "down 10 pt", null side "—" no ▲/▼, no "0.75"/"+0.25" anywhere; AC-7 "$0.04 → $0.06" + "▲ +$0.02", equal "$0.00" no glyph, A null "— → $0.06" and difference "—", genuine 0 "$0.00"; AC-9 collapsed no legend, after Show diff "v6 (old)"/"v7 (new)"; AC-10 footer Close / X (`getAllByRole("button",{name:"Close"})`) / Escape (`fireEvent.keyDown(document,{key:"Escape"})`) / backdrop (Modal's first child div inside the portal) each call `onClose`, fetch log only GETs; AC-12 hand `vi.stubGlobal("fetch")` 500 for one id, Retry re-sends only that GET, Close works; NFR-1 focus on dialog while loading, footer Close after load, Tab/Shift+Tab wrap.

**T59.** `regressionBanner(runs): {version, dips:{metric,points,belowOne}[], ups: metric[], differentCaseSets} | null`. Finished runs (`isFinished`) in given newest-first order; newest=[0], prev=[1]; <2 finished → null; per metric `pointDelta(metricDelta(prev,newest))`: down = dip, up = up, null/flat names nothing; null when neither recall nor precision dips (citation-only dip → null); `differentCaseSets = !sameCaseSet`. Component renders nothing for null/loading/error; else `<div>` labelled by `history.regression.label`; sentence 1: dip clauses via `list2`/`list3` (first uses `metricStart`) + `dipSentence` with newest `agent_version`; sentence 2: `up1`/`up2`; sentence 3: `caseSets`. Unit cases: precision 0.80→0.78 "dipped 2 pts"; 0.801→0.798 belowOne; 1 point "1 pt"; failed/running between two finished skipped; 0 or 1 finished → null; equal → null; recall up only → null; citation-only dip → null; null recall/precision → null; precision down + recall/citation up → "Recall and citation both up."; only recall up → "Recall up."; unchanged/null metric not named; case sets differ/equal; three dips → `list3`.

**T60.** `EvalsTab` renders `<RegressionBanner agentId/>`, `<EvalRunHistory agentId onCompare={setCompareIds}/>` (always), `{compareIds && <EvalCompare … onClose={() => setCompareIds(null)}/>}`; update header comment. Tests: AC-4 `compare.focus()` then click → dialog; AC-11 "Run history" region present while open and both checkboxes still checked + Compare enabled after Close; NFR-1 focus returns to Compare; NFR-4 no non-GET; banner text above "Run history" heading (`compareDocumentPosition`), exactly one `GET /agents/ag1/eval-runs` call; AC-15 differing `case_ids` → case-set sentence; AC-16 no banner while history pending (deferred) or on 500.

**T63.** `RecentRuns` uses `useEvalRecentRuns(10)`; `<section aria-labelledby>` + h2 `dashboard.recent.title`; states: loading text; error `ErrorState` Retry → `refetch()`; empty `dashboard.recent.empty`. Rows in response order: agent cell `<Link href={`/agents/${agent_id}?tab=evals`}>` with nowrap+ellipsis+`title` (EC-9); `formatRanAt`, `history.version`; 3 metric cells `MetricPercent` + decorative bar `<span aria-hidden="true" style={{width:`${toPercent(v)}%`}}>` (no bar for null); `history.passedOfTotal`; "partial" label as text. Tests: response order kept; 0.75→"75%"; null→"—" no bar; bars `aria-hidden`; link href/name; `<script>alert(1)</script>` name literal and `document.querySelector("script")` null; "partial"; "7 / 8"; loading before deferred resolve; AC-18 both combinations (empty recent + non-empty dashboard → agent rows + "No finished eval runs yet."; empty dashboard + recent rows → B-AC-12 empty text + recent rows); AC-19 recent 500 + dashboard 200 → agent rows + "Retry" inside recent section, Retry re-sends only `/eval/recent-runs?limit=10`; NFR-4 only GETs.

**T65 docs.** `server/docs/eval.md`: routes table + `GET /eval/recent-runs` (query, 422, finished only, deleted agents excluded, current name, global limit only), short "Recent runs (Spec D)" paragraph, Verification adds the it-file (+T66 result), Sources adds Spec D. `client/docs/eval-ui.md`: surfaces mermaid (dashboard→`GET /eval/recent-runs`; Evals tab→banner (derived, no request); compare dialog), hooks table + `useEvalRecentRuns`, rewrite Evals-tab section (no swap, dialog, banner rules, selection survives), dialog a11y moves to `src/lib/hooks/dialog-a11y.ts` with 2 consumers, formats section. `server/README.md` (~:84 eval node + `/eval/recent-runs (GET)`; §Eval Spec D link), `client/README.md` (~:42 edge label `GET /eval/dashboard · GET /eval/recent-runs`).

## 5. Execution (single agent order)

W0 baseline `scripts/check-all.sh` → contracts T43→T44 → server T45→T49 (run it-file with Docker) → client foundation T50→T54 → compare T55→T58 → banner/tab T59→T60 → formats/dashboard T61→T63 → cleanup T64 → verification (main session `check-all.sh`, architecture-reviewer, plan-verifier) → T65 docs → T66 only after explicit user approval. Suggested commits: contracts; server recent-runs; shared dialog hook; format helpers+i18n+components+hook; compare dialog; banner+tab; percent formats+recent section; cleanup; docs.

## 6. Test plan

Per task `scripts/check-pkg.sh`; per package at end `scripts/check-pkg.sh server|client`. Server DB-backed: `cd server && DEVDIGEST_REQUIRE_DOCKER=1 pnpm exec vitest run test/eval-recent-runs.it.test.ts test/eval-history.it.test.ts`. `pnpm verify:l06` must pass with Docker and fail without it. Client: `cd client && pnpm test`; `pnpm build` only with `next dev` stopped. NFR-5: parity test + `cmp`. NFR-2 manual (T66, user-gated). Not run: e2e, `evals/`.

## 7. Coverage matrix

AC-1 T43,45–49 (eval-helpers; recent-runs.it) · AC-2 T43,46–49 · AC-3 T43,48,49 · AC-4 T58,60 · AC-5 T52,58 · AC-6 T51,53,56,58 · AC-7 T55,56,58 · AC-8 T56,58 · AC-9 T57,58 · AC-10 T58 · AC-11 T60 · AC-12 T58 · AC-13 T51,59,60 · AC-14 T59 · AC-15 T55,59,60 · AC-16 T59,60 · AC-17 T54,63 · AC-18 T63 · AC-19 T54,63 · AC-20 T53,61 · AC-21 T51,53,62 · NFR-1 T50,53,58,60,62,63 · NFR-2 T46,T66 · NFR-3 T46,48,49,63 · NFR-4 T48,49,58,60,63 · NFR-5 T43,44 · NFR-6 T52 · NFR-7 T49 (`verify:l06` + client tests).

## 8. Risks and traps

- **R1** next-intl may parse `<…` as a rich tag: assert "<1 pt" literally; if parsing fails escape with ICU quoting (`'<'1`).
- **R2** two buttons named "Close" (vendored X + footer): use `getAllByRole`; initial focus ref on footer button; check `Button` forwards `ref`.
- **R3** focus return needs a focused opener: `.focus()` Compare before `fireEvent.click`.
- **R4** `aria-labelledby` set once on mount: title span with id must exist from first render; change its text, not the element.
- **R5** never edit `client/src/vendor/ui/**`; if an EvalCaseModal test needs an edit after T50, behaviour changed — stop and fix the move.
- **R6** portal + RTL: query dialog via `screen`, not the render container.
- **R7** `mockFetch` keys include the query string (`"GET /eval/recent-runs?limit=10"`); unmatched → 404 so existing dashboard tests need the stub; retry-count assertions filter by path; error paths need a hand `vi.stubGlobal("fetch")`; `ErrorState` queried by "Retry".
- **R8** querystring numbers need `z.coerce.number()` under `fastify-type-provider-zod`; `""` coerces to 0 → fails min; repeated `limit` → array → NaN → 422; `.default(10)` covers absent; verify `req.query.limit` is the parsed number.
- **R9** unique partial index: one `running` suite per agent in seeds.
- **R10** shared default workspace (`LocalNoAuthProvider`): own container + newer `ran_at` base per test.
- **R11** tie order: assert with sorted ids.
- **R12** float noise: all metric deltas go through 6-dp `metricDelta` before `pointDelta`; never subtract rounded percents (EC-19); cost delta rounds before equality check.
- **R13** moving `metricDelta` adds rounding: move its unit test to `format.test.ts`.
- **R14** ICU plural labels need `points` passed as a number; `belowOne` has its own key.
- **R15** `t.rich` with empty tags must give textContent exactly "82% (▲ 4 pt)"; `role="img"` doesn't change textContent.
- **R16** no per-route rate limit (global 120/min inert under test); no 429 test.
- **R17** `test/reviews.it.test.ts` flaky on clean tree — not a regression.
- **R18** do not delete staged `dashboard.metricTrend`/`dashboard.recentRuns` keys (NG-1); T64 removes only keys `rg` proves unused.

## 9. Handoff

**Do not touch:** `client/src/vendor/ui/**`, `reviewer-core/**`, `server/src/platform/{prompt,grounding,structured}.ts`; `**/src/vendor/shared/**` except T43/T44; migrations, DB schema, lockfiles, `node_modules`, `server/clones/**`, `evals/**`; `server/test/eval-history.it.test.ts` and `eval-cases.it.test.ts`; Spec B and Spec D bodies.

**architecture-reviewer:** route thin with `querystring`+`schema.response` from shared; drizzle only in `repository.ts`; no `agents/*` import; no migration/index; `dialog-a11y.ts` imports only React with 2 consumers and the old file gone; `components/eval-metric/` imports no route code; `RecentRuns`/`RegressionBanner` nested; no `fetch` in components; no new barrel; `formatMetric`/`formatSignedDelta` gone.

**Security (main session):** workspace scoping on both sides of the join; `limit` bounded 50; names/case names/prompt lines render as plain text; no mutating request added; zero model calls.

**INSIGHTS candidates:** `useDialogA11y` now in `lib/hooks/dialog-a11y.ts`, dialog focus-return tests must `.focus()` the opener first; next-intl ICU literal `<` (if R1 bites); querystring numbers need `z.coerce`.
