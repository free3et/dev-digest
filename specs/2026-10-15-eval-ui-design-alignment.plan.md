# Implementation Plan: Eval UI labels and layout aligned with the design mockups

Spec: `specs/2026-10-15-eval-ui-design-alignment.md` · Spec ID: SPEC-2026-10-15-eval-ui-design-alignment · Spec status: approved (free3et, 2026-10-16) · Mode: single · Package: client (UI only)

Continues the plans of Specs A–D (T43–T66); numbering starts at T67. AC IDs without prefix are Spec E; `B-AC-n` Spec B, `D-AC-n` Spec D. Written by `implementation-planner` (pass 2); saved by the main session. No server, contract, DB or migration work.

## 1. Decisions

- **E1 TZ pin.** `client/vitest.config.ts` sets `process.env.TZ = "UTC"` at module top (before `defineConfig`); `format.test.ts` gets a guard `expect(new Date(0).getTimezoneOffset()).toBe(0)`. Non-UTC cases pass an explicit `timeZone` to the helper (never rely on the environment). Rejected: TZ in package.json script (check-pkg.sh bypasses it), setup.ts (too late), mocking Intl.
- **E2 Formatter.** `lib/format.ts`: add `formatRanAtLocal(iso, timeZone?)` using `Intl.DateTimeFormat("en-US", {timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts` → `YYYY-MM-DD HH:mm`; unparsable input returned as is. Keep `formatRanAt` (UTC, "… UTC") as the exact-instant tooltip.
- **E3 `RanAt({iso})`** in `components/eval-metric/EvalMetric.tsx`: `<time dateTime={iso} title={formatRanAt(iso)}>{formatRanAtLocal(iso)}</time>`; unparsable → no `dateTime`, title = raw value. Re-exported from `index.ts`.
- **E4 Caption style.** `components/eval-metric/constants.ts` exports `EVAL_CAPTION_STYLE`: fontSize 11, fontWeight 700, letterSpacing "0.07em", textTransform "uppercase", color `var(--text-secondary)`. **Deviation from spec wording ("muted text colour"):** `--text-muted` fails NFR-1's 4.5:1 in both themes, so `--text-secondary` is used (also for the case `file:line` line). Spec follow-up: amend the term.
- **E5** `lib/visually-hidden.ts` exports `VISUALLY_HIDDEN` (absolute, 1×1, margin −1, overflow hidden, clip rect(0,0,0,0), nowrap, border 0).
- **E6** `EvalDashboard/constants.ts` exports `METRIC_COLOR = {recall:"var(--accent)", precision:"var(--ok)", citation_accuracy:"var(--warn)"}` ("orange" = `--warn`; no orange token, vendor untouched). Small percent text in the recent table stays `--text-primary`; only bars take colour.
- **E7 Pills/badges.** Text colour `var(--text-primary)`; tone carried by 1 px longhand border in the tone colour + `-bg` tint. Tones: drop→`--crit`, running→`--accent`, partial→`--warn`, positive→`--ok`, negative→`--warn`.
- **E8 Kind badge.** `Badge` (vendored) has no title/aria props → wrap: `<span role="img" aria-label={name} title={name}><Badge …>Positive</Badge></span>` (same pattern as `PointDelta`).
- **E9 Abbreviated captions:** `<span title="Precision"><span aria-hidden="true">Prec</span><span style={VISUALLY_HIDDEN}>Precision</span></span>`.
- **E10 i18n names:** `evalsTab.kind.must_findName` / `must_not_flagName` literally; pills `dashboard.card.pill.*`, tooltips `dashboard.card.pillTitle.*`.
- **E11 Key removal** (only after `rg` in client/src, client/docs, e2e shows zero uses; T80): `dashboard.driftTitle`, `dashboard.viewEvals`, `dashboard.metricWithDelta`, `dashboard.casesColumn`, `dashboard.latestRunColumn`, `dashboard.agentColumn`, `dashboard.casesCount`, `dashboard.neverRun`, `dashboard.dropLabel`, `dashboard.runningLabel`, `dashboard.recent.columns.passed`, `history.columns.passed`, `compare.subtitle`. Keep staged legacy keys (`dashboard.metrics.*`, `dashboard.table.*`, `dashboard.legend.*`, `dashboard.metricTrend`, `dashboard.recentRuns`, `dashboard.pass`/`fail`, `casesSummary`), `dashboard.openEvalsFor`, `history.subtitle`.
- **E12 Card structure:** nested `EvalDashboard/AgentCard/` (local `MetricBlock`); `EvalDashboard` keeps header, Agents section, states, `<ul role="list" aria-labelledby>` (explicit role: list-style none drops semantics in Safari).
- **E13 Recent table:** `<colgroup>` (agent auto, ran-at 140, version 56, 3×110 metrics, pass 96); rows as cards (`borderCollapse: separate`, `borderSpacing: 0 6px`, td bg `--bg-elevated`, radius on first/last cell); header row visually hidden via `VISUALLY_HIDDEN` on `<thead><tr>`.
- **E14 History count:** `chosen = runs.data ? effectiveSelection(selected, runs.data) : []` computed before body branches; section `aria-label` constant `history.title`; visible h3 text changes.
- **E15** pure `caseSetSubtitle(a,b): {same:true,count}|{same:false}` in `EvalCompare/helpers.ts` using `sameCaseSet`; `count = a.case_ids.length`.

## 2. Architecture constraints

Single-consumer parts nested (`AgentCard/`, `StatePill/`); feature constants in `EvalDashboard/constants.ts`; cross-route things in `src/components/eval-metric/` (`RanAt`, `EVAL_CAPTION_STYLE`); domain-free in `src/lib/` (`formatRanAtLocal`, `VISUALLY_HIDDEN`); `lib/` never imports `components/` or `app/`; no new barrel beyond a folder's own `index.ts`; components render only (logic in helpers/format); no `fetch`, no new hook/query key/polling (NFR-2); strings only in `messages/en/eval.json`, uppercase by styling only (C-6), plurals via `t(key,{count})`; types from `@devdigest/shared` as `import type`; vendor (`client/src/vendor/**`) untouched; formatting of times only in client components over client-fetched data (no SSR hydration mismatch).

## 3. Contract changes

None. No vendor sync, no migration, no server task. NFR-4 checked by `git diff --stat` (T81).

## 4. Tasks

"check" = `scripts/check-pkg.sh client <files>`. `…/EvalsTab/` = `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/`; `…/EvalDashboard/` = `client/src/app/eval/_components/EvalDashboard/`.

| # | Work | Files | AC |
|---|---|---|---|
| T67 | TZ pin + guard test (E1) | `client/vitest.config.ts`, `client/src/lib/format.test.ts` | support AC-5/12 |
| T68 | `formatRanAtLocal` (E2); `formatRanAt` comment → "UTC tooltip" | `client/src/lib/format.ts`, `format.test.ts` | AC-12 |
| T69 | `RanAt`, `EVAL_CAPTION_STYLE`, `VISUALLY_HIDDEN` (E3–E5) | `client/src/components/eval-metric/{EvalMetric.tsx,index.ts,constants.ts,EvalMetric.test.tsx}`, `client/src/lib/visually-hidden.ts` | AC-12, 13, NFR-1 |
| T70 | `METRIC_COLOR`; `StatePill({label,title?,tone})` (inline-flex, nowrap, flexShrink 0, 11px bold, longhand border, text `--text-primary`) | `…/EvalDashboard/constants.ts`, `…/EvalDashboard/StatePill/{StatePill.tsx,index.ts,styles.ts}` | support AC-4, 11 |
| T71 | Add new i18n keys (additive only) | `client/messages/en/eval.json` | NFR-5 |
| T73 | `AgentCard({row})` | `…/EvalDashboard/AgentCard/{AgentCard.tsx,index.ts,styles.ts,AgentCard.test.tsx}` | AC-3–9, 12, NFR-1, 3 |
| T74 | `EvalDashboard` page: h1 `dashboard.defaultTitle` + `dashboard.subtitle`; Agents section (`<section aria-labelledby>`, h2 with caption style + `Icon.Gauge` aria-hidden); `<ul role="list">` of `AgentCard`; states unchanged; drop table/COLUMNS/metric()/unused styles | `…/EvalDashboard/{EvalDashboard.tsx,styles.ts,EvalDashboard.test.tsx}` | AC-1, 2, 20, NFR-2 |
| T75 | `RecentRuns` card-table (E13); h2 with caption style + `Icon.Clock`; bold agent link (ellipsis+title), `<RanAt>` mono, version span `--accent-text` (not a link), bars in `METRIC_COLOR` with `data-metric-bar` + percent, `<strong>` pass, `StatePill` partial; `recent.columns.pass` "Pass"; **change** `history.passedOfTotal` to `"{passed}/{total}"` and update `EvalRunHistory.test.tsx:64` in the same task; update selector `RecentRuns.test.tsx:71` | `…/EvalDashboard/RecentRuns/{RecentRuns.tsx,styles.ts,RecentRuns.test.tsx}`, `eval.json`, `…/EvalsTab/EvalRunHistory/EvalRunHistory.test.tsx` | AC-10–13, NFR-1, 3 |
| T76 | `EvalCasesList` row: line 1 kind badge (E8) + name (flexGrow 1, flexShrink 1, minWidth 0, nowrap, ellipsis, title) + Delete; line 2 `file:line` (mono, `--text-secondary`, ellipsis, title); values `evalsTab.kind.must_find`→"Positive", `must_not_flag`→"Negative" | `…/EvalsTab/EvalCasesList/{EvalCasesList.tsx,styles.ts,EvalCasesList.test.tsx}`, `eval.json` | AC-14, 15, NFR-1, 3 |
| T77 | `EvalRunHistory`: COLUMNS `select, ranAt, version, status, recall, precision, citation, pass, cost`; every `th` spreads caption style; "Select" in `VISUALLY_HIDDEN`; ran-at via `<RanAt>`; checkbox label uses `formatRanAtLocal`; version `--accent-text`; pass uses new `passedOfTotal`, `EMPTY` while running; header row (`justifyContent: space-between`): left `<h3>` = `chosen.length>=1 ? t("history.selected",{count}) : t("history.title")` + subtitle, right Compare (only when `runs.data?.length>0`); `history.title`→"Recent runs" | `…/EvalsTab/EvalRunHistory/{EvalRunHistory.tsx,styles.ts,EvalRunHistory.test.tsx}`, `…/EvalsTab/EvalsTab.test.tsx`, `eval.json` | AC-12, 13, 16, 17, NFR-1, 2 |
| T78 | `RegressionBanner` look: keep `<p role="note" aria-label>`; flex, gap 8; longhand border `--warn`, bg `--warn-bg`; leading `Icon.AlertTriangle` aria-hidden; text in `<span>`; sentence logic unchanged | `…/EvalsTab/RegressionBanner/{RegressionBanner.tsx,styles.ts,RegressionBanner.test.tsx}` (new test) | AC-18, NFR-1 |
| T79 | Compare: `caseSetSubtitle` + `compare.subtitleCaseSet`/`subtitleDifferentSets`; `CompareTiles` label and `PromptDiff` h4 spread caption style; `CompareRunInfo` ran-at uses `<RanAt>` | `…/EvalCompare/{helpers.ts,helpers.test.ts,EvalCompare.tsx,EvalCompare.test.tsx}`, `…/EvalCompare/CompareTiles/styles.ts`, `…/EvalCompare/PromptDiff/PromptDiff.tsx`, `…/EvalCompare/CompareRunInfo/CompareRunInfo.tsx` | AC-12, 13, 19 |
| T80 | Dead keys/code (E11): `rg` each key (client/src, client/docs, e2e) then remove zero-hit keys; `rg "formatRanAt\("` shows only `RanAt` + tests | `eval.json` | NFR-5 |
| T81 | Manual (user-gated, jsdom has no layout): contrast of metric colours/pill borders/amber callout in dark **and** light; keyboard pass on `/eval` (one tab stop per card, focus ring on chevron); 40-char name with pills fully shown at 1280 px, 120-char ellipsizes; 70-char case name shown in full; `git diff --stat` only client src (not vendor), `eval.json`, `vitest.config.ts`, docs; `pnpm typecheck && pnpm build` with `next dev` stopped | — | AC-8, 9, 15, NFR-1, 4, 6 |
| T82 | Docs: see §9 | `client/docs/eval-ui.md`, `client/docs/README.md`, `TESTING.md` | support |

(T72 intentionally unused.)

### T71 key list (`eval.json`; "·" U+00B7, "—" U+2014)

`dashboard.subtitle` "Regression harness across all reviewer agents · pick an agent to see its runs"; `dashboard.agents.title` "Agents"; `dashboard.card.lastRun` "Last run v{version} · <time></time> · {passed}/{total} pass" (rich, `time: () => <RanAt iso={latest.ran_at}/>`); `dashboard.card.neverRun` "Never run · {count, plural, one {# case} other {# cases}}"; `dashboard.card.pill.{drop,running,partial}` "drop"/"running"/"partial"; `dashboard.card.pillTitle.drop` "Recall or precision fell against the previous finished run", `.running` "An eval run was in progress when this page loaded", `.partial` "The latest run finished with errored cases"; `dashboard.card.metric.{recall,precision,citation}` "Recall"/"Prec"/"Cite"; `dashboard.card.metricName.{recall,precision,citation}` "Recall"/"Precision"/"Citation accuracy"; `dashboard.recent.columns.pass` "Pass"; `evalsTab.kind.must_findName` "Positive case · must find", `must_not_flagName` "Negative case · must not flag"; `history.selected` "Recent runs · {count} selected"; `history.columns.pass` "Pass"; `compare.subtitleCaseSet` "Old prompt vs new — metric deltas and prompt diff on the {count}-case set"; `compare.subtitleDifferentSets` "Old prompt vs new — metric deltas and prompt diff on different case sets". Value changes in their tasks: `history.title`→"Recent runs" (T77), `history.passedOfTotal`→"{passed}/{total}" (T75), `evalsTab.kind.must_find`→"Positive"/`must_not_flag`→"Negative" (T76).

### T73 AgentCard

`<li>` flex, align center, gap 16, bg `--bg-elevated`, longhand border `--border`, radius 10. Left column (flexGrow 1, flexShrink 1, minWidth 0): line 1 icon tile (`Icon.FlaskConical` aria-hidden) + name + pills; line 2 last-run/never-run text (`--text-secondary`, 12.5px, nowrap, ellipsis). Right: 3 `MetricBlock`s (flexShrink 0, minWidth 64, centred) + chevron link. Name `<span title={agent_name}>` flexGrow 1, flexShrink 1, minWidth 0, nowrap, ellipsis, bold; pills flexShrink 0; no model chip (NG-1). Pills order drop (crit), running (accent), partial (warn, only when `latest?.status==="partial"`), each `title` = pillTitle text. MetricBlock: caption (E9, caption style), value `<MetricPercent>` fontSize 22, bold, `color: METRIC_COLOR[field]`, lineHeight 1.1; delta `<PointDelta delta={pointDelta(row.delta[field])}/>` 11.5px only when value non-null; null value/`latest==null` → "—" and no delta. Chevron: `<Link href={`/agents/${agent_id}?tab=evals`} aria-label={t("dashboard.openEvalsFor",{name})}>` with `Icon.ChevronRight` aria-hidden, 32×32, no outline override.

Test cases (`renderWithProviders(<ul><AgentCard row=…/></ul>)`): AC-3 name+title, `<script>` literal, icon aria-hidden, no model text; AC-4 pills + titles, partial only for partial; AC-5 textContent exactly "Last run v7 · 2026-05-29 09:14 · 17/20 pass", no "UTC" text, `getByTitle("2026-05-29 09:14 UTC")`; AC-6 "Never run · 1 case"/"5 cases", three "—", no img roles; AC-7 "82%" + img "up 4 pt", "down 25 pt", "unchanged", null delta "—", null value "—" no delta, titles "Precision"/"Citation accuracy", caption uppercase, value fontSize "22px", no parentheses; AC-8 exactly 1 link named "Open Evals tab of Zed" href `/agents/z1?tab=evals`, no "Open Evals tab" text; AC-9 name flexGrow "1", minWidth 0, nowrap, ellipsis, full title.

### T74 EvalDashboard tests (rewrite `:64-104`, keep `:106-130`)

AC-1 h1 + subtitle, old subtitle absent; AC-2 `list` named "Agents" has 3 listitems in order Zed, `<script>…`, Newbie, drop row first, no `columnheader` in Agents region, h2 uppercase, icon aria-hidden; i18n `agents.title`/`card.metric.*` match `/[a-z]/`; NFR-2 sorted GET paths equal `["/eval/dashboard","/eval/recent-runs?limit=10"]`, all GET; AC-20 existing empty/error/Retry/loading tests pass unchanged.

### T75 RecentRuns tests

AC-10 region name "Recent eval runs · all agents", h2 uppercase, clock aria-hidden; AC-11 `cells(0)` = `["Zed","2026-10-12 09:30","v3","75%","50%","—","7/8"]`, row 1 "7/8partial", "7/8" in STRONG, version not a link and no underline, bars via `[data-metric-bar]` aria-hidden with widths 75%/50% and bg `var(--accent)`/`var(--ok)`, columnheader names Agent/Ran at/Version/Recall/Precision/Citation/Pass, header tr position absolute + clip, partial pill only row 1; AC-12 title "2026-10-12 09:30 UTC", no "UTC" text; NFR-3 `<script>` literal; states unchanged.

### T76 EvalCasesList tests

AC-14 `getByLabelText("Positive case · must find")`, `getByTitle("Negative case · must not flag")`, texts "Positive"/"Negative", old "must find"/"must not flag" absent, badge uppercase, `*Name` keys exist; AC-15 name and location in different parents, location after name, both `title`, name flexGrow "1"/minWidth 0/ellipsis, badge before name; NFR-3 `<script>` literal; delete/confirm tests unchanged.

### T77 tests

`EvalRunHistory.test.tsx`: UTC strings become local ("2026-10-12 10:00" with title "… UTC"); checkbox names "Select run from 2026-10-12 10:00"; AC-17 header names Select … Cost, no "Passed", "Select" visually hidden, "3/4", running row "—"; AC-16 region "Recent runs", heading "Recent runs" / "· 1 selected" / "· 2 selected", Compare enabled only with two, failed/running never counts, no "Run history" heading, Compare in same header as h3; AC-13 th uppercase while text sentence case, `history.columns.ranAt` matches `/[a-z]/`; AC-12 no "UTC" text. `EvalsTab.test.tsx`: `:63,65,84,85` names lose " UTC"; `:73` region "Recent runs"; `:111` heading "Recent runs"; NFR-2 baseline GET set unchanged (record from unmodified test first).

### T79 tests

`helpers.test.ts`: same 8 ids → `{same:true,count:8}`, 1 id → count 1, different → `{same:false}`, order-insensitive. `EvalCompare.test.tsx`: equal sets → "Old prompt vs new — metric deltas and prompt diff on the N-case set"; default fixtures (different sets) → "… on different case sets"; absent while loading; no "20-trace"/"gold set"; ran-at "2026-10-10 10:00" with title "… UTC"; tile captions and "System prompt diff" uppercase; title "Compare runs · v6 → v7" unchanged.

## 5. Execution

W0 baseline `scripts/check-all.sh` (dirty tree: stage only this plan's hunks) → T67–T71 → T73–T75 → T76–T78 → T79 → T80 → main-session checks (`check-all.sh`, `--build` with `next dev` stopped, architecture-reviewer, plan-verifier) → T81 (browser part user-gated) → T82. Suggested commits: TZ+formatter; agent cards; headerless recent runs; badges+history heading; banner/compare captions; unused keys; docs.

## 6. Test plan

Per task `scripts/check-pkg.sh client <files>`; end `scripts/check-pkg.sh client`, then `cd client && pnpm build` with `next dev` stopped (restart dev after; `rm -rf .next` if 500). pnpm only; no Docker/server/e2e. All time assertions run under pinned UTC; non-UTC only via explicit `timeZone`. A11y by role/name/title/`aria-hidden`/style queries; contrast and focus ring manual (T81).

## 7. Coverage matrix

AC-1 T71,74 · AC-2 T74 · AC-3 T73 · AC-4 T70,71,73 · AC-5 T67,69,71,73 · AC-6 T71,73 · AC-7 T70,71,73 · AC-8 T73,81 · AC-9 T73,81 · AC-10 T69,75 · AC-11 T69,70,75 · AC-12 T67,68,69,73,75,77,79 · AC-13 T69,74,75,77,79 · AC-14 T71,76 · AC-15 T76,81 · AC-16 T71,77 · AC-17 T75,77 · AC-18 T78 · AC-19 T71,79 · AC-20 T74,75 · NFR-1 T69,70,73,75,76,78,81 · NFR-2 T74,77 · NFR-3 T73,75,76 · NFR-4 T81 · NFR-5 T71,80 · NFR-6 T80,81.

## 8. Risks and traps

- **R1** TZ pin: if removed the T67 guard fails; never "fix" a time assertion by editing to the developer's zone.
- **R2** Intl: `hourCycle: "h23"` (not `hour12:false`, can print "24:05"); map `formatToParts` by `type`.
- **R3** jsdom drops CSS shorthands containing `var()`: test longhands (`borderColor/Style/Width`, `flexGrow/flexShrink/minWidth`); never mix shorthand base with longhand override (INSIGHTS 2026-10-07).
- **R4** `aria-label` on generic span isn't exposed → `role="img"` or visually hidden text.
- **R5** lucide icons: pass `aria-hidden="true"` explicitly and assert.
- **R6** `RecentRuns.test.tsx:71` counted `span[aria-hidden]` per row → select bars by `[data-metric-bar]`.
- **R7** `history.passedOfTotal` is shared: update `EvalRunHistory.test.tsx:64` in the same task as T75.
- **R8** Region name vs heading text (constant aria-label "Recent runs"); don't reuse/delete the staged key `dashboard.recentRuns`.
- **R9** `t.rich` for `card.lastRun`: assert textContent, not `getByText` across elements; pass `count` as number for `neverRun`.
- **R10** `role="list"` explicit on the card list.
- **R11** `--text-muted` and `--ok`/`--warn` small text fail 4.5:1 → E4/E7; verify both themes (default dark).
- **R12** Key removal: `rg` client/src, client/docs, e2e first; don't touch staged legacy keys, Spec C modal keys (`caseEditor.banner.*`) or FindingCard button labels (NG-11); `EvalCaseControl.test.tsx:91,104,173`, `FindingCard.test.tsx:71` pass unchanged.
- **R13** `mockFetch` answers 200/404, keys include query string; error paths need `vi.stubGlobal("fetch")`; `ErrorState` queried by "Retry"; no user-event (use `fireEvent`).
- **R14** `pnpm build` while `next dev` runs corrupts `.next`.
- **R15** Never format `ran_at` in a server component (hydration).
- **R16** Dirty tree on `hw6-evals`: don't revert or reformat neighbouring changes.
- **R17** `sameCaseSet` order-insensitive; `count = a.case_ids.length` valid (frozen, no duplicates).

## 9. Handoff

**Do not touch:** `client/src/vendor/**`, `server/**`, `reviewer-core/**`, `e2e/**`, `evals/**`, migrations, lockfiles, `server/clones/**`; bodies of Specs A–E; `EvalCaseModal`, `EvalCaseControl`, `FindingCard` and their keys; hooks (`useEvalDashboard`, `useEvalRecentRuns`, `useAgentEvalRuns`); banner sentence logic (`RegressionBanner/helpers.ts`).

**T82 docs:** `client/docs/eval-ui.md` — dashboard row-cards (structure, pills+tooltips, last-run/never-run, metric blocks with captions/colours, chevron link, `role="list"`), recent runs headerless card-table (hidden thead, `[data-metric-bar]`, bold n/m, partial pill, accent version), Evals tab (positive/negative badges with accessible names, two-line case row, "Recent runs · N selected" with Compare in heading row, "Pass" column, "Select" hidden), amber banner, compare subtitle "N-case set"/"different case sets", uppercase captions, Metric formats (timestamps `formatRanAtLocal` + UTC tooltip via `RanAt`, `METRIC_COLOR`, `EVAL_CAPTION_STYLE` with `--text-secondary` and why, `VISUALLY_HIDDEN`, `n/m`), consumers list, Sources + Spec E. `client/docs/README.md:14` index row append "local timestamps with UTC tooltip, uppercase captions". `TESTING.md` client note: tests run with `TZ=UTC` pinned in `client/vitest.config.ts`; non-UTC cases pass `timeZone` explicitly. `specs/eval-pipeline.md` Spec E line → "implemented" only after plan-verifier passes.

**architecture-reviewer:** `RanAt`/`EVAL_CAPTION_STYLE` in `components/eval-metric/`; `VISUALLY_HIDDEN`/`formatRanAtLocal` in `lib/` importing nothing from `components`/`app`; `AgentCard/`, `StatePill/` nested; `METRIC_COLOR` feature-local; no new barrel/`fetch`/hook; no vendor edit; `/agents/[id]` and `/eval` don't import each other's `_components`.

**Security:** no new input/endpoint; names render as React text and `title` only; nothing reaches a model.

**INSIGHTS candidates (client):** `--text-muted` fails AA on both themes (use `--text-secondary` for small AA text); jsdom drops CSS shorthands with `var()`; vitest TZ pin via `process.env.TZ` in config; vendored `Badge` has no title/aria → wrap in `role="img"` span.
