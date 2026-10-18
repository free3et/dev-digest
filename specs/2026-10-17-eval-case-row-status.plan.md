# Implementation Plan: Eval case rows show their last result (agent and skill Evals tabs)

Spec: `specs/2026-10-17-eval-case-row-status.md` · Spec ID: SPEC-2026-10-17-eval-case-row-status · Spec status: approved (user, 2026-10-17; OQ-1, OQ-2 = spec defaults) · Mode: single · Packages: client

This builds on the G2 plan and starts only after G2 is merged into the working tree. Paths assume G2 T1 (`EvalCasesList` in `client/src/components/agent-evals/EvalCasesList/`) and the G2 owner props. AC IDs are this spec's (G3).

## 1. Context consulted

- Spec G3; G1 C-7, C-8, C-10; Spec A Match rule (`specs/2026-10-12-eval-cases-and-scoring.md:131-138`); dashboard "latest" (`server/docs/eval.md:297-298`); the G2 plan above.
- `client/docs/eval-ui.md` ("Evals tab", "`EvalRunControl`", metric formats); `client/INSIGHTS.md` (same entries as G2, plus 2026-09-26 truncation).
- Code:
  - Current row: `EvalCasesList.tsx:53-137`. Run control: `EvalRunControl.tsx:66-111`.
  - `lastFinishedRun`, `runningRun`, `casesDone`: `AE/EvalRunControl/helpers.ts:27-43`. `isFinished`: `AE/helpers.ts:4`.
  - `useEvalRun` (key `["eval-run", id]`, polls only while `running`): `client/src/lib/hooks/eval.ts:142-167`.
  - Contracts: `EvalRunRecord` (`case_id`, `outcome`, `actual_output.kept`, `error`) and `EvalSuiteRunDetail.cases` in `eval-ci.ts:57-141`; `Finding.file/start_line/end_line` in `findings.ts:52-54`; `EvalExpectation` in `knowledge.ts:83-111`.
  - Icons available in `client/src/vendor/ui/icons.tsx`: `CheckCircle`, `XCircle`, `AlertTriangle`, `Dot`, `Play`, `Edit` (= `Pencil`), `Trash`.
  - Existing i18n `evalsTab.*` (`client/messages/en/eval.json:178-250`).
- Existing tests that query the per-row controls by accessible name (`/Run eval case “…/`) keep working. "Run eval (n)" is asserted only in `EvalRunControl.test.tsx` and the per-agent page tests, which keep the default label (NG-5).

## 2. Decisions

- **E1 OQ-1 default:** the icon comes from the stored `outcome`; "got N" is matched against the current expectation; no marker for a disagreement. **OQ-2 default:** without a reference suite the heading reads exactly "Eval cases".
- **E2 Reference suite:** `referenceSuite(runs) = runs.find(isFinished)` (newest `done`/`partial`). Move `lastFinishedRun` from `AE/EvalRunControl/helpers.ts` into `AE/helpers.ts` as `referenceSuite`. `EvalRunControl` imports it (same logic), so there is no sideways import between component folders.
- **E3 Pure core** in `AE/EvalCasesList/helpers.ts`:
  - `matchCount(kept, exp)`: same `file` (exact string) and closed ranges intersect, `f.start_line <= exp.end_line && exp.start_line <= f.end_line`, tolerance 0.
  - `recordsByCase(detail)`: `Map<case_id, EvalRunRecord>`.
  - `rowView(case, results)` → `{ status: "passed" | "failed" | "errored" | "neverRun" | null, second: { kind: "result", expected: 0|1, got } | { kind: "neverRun" } | { kind: "errored", error } | { kind: "locationOnly" }, file, line }`. `null` status and `locationOnly` apply when results are unavailable (AC-9).
  - `passingCount(cases, records)` → `{ passed, total } | null` (null without a reference suite or when unavailable). T = current cases; P = current cases whose record has `outcome: "passed"`. Records of deleted cases are ignored (EC-2).
  - `assertParts(exp)` → `{ kind: "assertEmpty" } | { kind: "severity", severity: string | null, category: string | null } | null`. Severity is upper-cased, empty parts are dropped, and `null` is returned when both are empty (AC-6, EC-4).
- **E4 Data hook** colocated at `AE/EvalCasesList/hooks/useCaseResults.ts(owner)`. It uses `useOwnerEvalRuns(owner)` (G2 dispatcher; same key as the run control) and `useEvalRun(referenceSuite(runs)?.id)`. Returns:
  - `{ state: "unavailable" }` while either query is loading or failed (AC-9);
  - `{ state: "ready", reference: null }` when runs are loaded with no finished suite;
  - `{ state: "ready", reference, records }` otherwise.
  NFR-2: at most one new request, `GET /eval-runs/:refId`; the key is shared with the compare dialog and the run control. When a tracked suite finishes, `useEvalRun` invalidates the owner's runs (G2 D3), the reference id changes, and the detail is usually already cached by the tracker (AC-8). A per-case Run never touches these keys (AC-8, NG-1).
- **E5 Heading row through the run control.** `EvalRunControl` gains optional props:
  - `label?: "runEval" | "runAll"` (default `runEval`; the per-agent page is untouched, NG-5);
  - `heading?: ReactNode`;
  - `actions?: ReactNode`.
  With `heading`, it renders one flex row `[heading][spacer][Run all evals / progress][actions]`, with its notices on a full-width line below, which keeps AC-2's order: heading, "Run all evals", "New eval case" (then G2's "Copy from agent case" slot). Confirm, progress, refusal and notice behaviour is unchanged (G2 D6 confirm, skill refusals).
  - `EvalCasesList` renders `<EvalRunControl … label="runAll" heading={<h3>…</h3>} actions={<>New eval case{extraActions}</>} />`.
  - `EvalsTab` and `SkillEvalsTab` drop their standalone `<EvalRunControl>`.
  - The section's `aria-label` stays `evalsTab.casesHeading`, so landmarks are stable.
- **E6 Row layout**, one `<li>` per case:
  - Line 1: status icon slot (absent while unavailable); kind badge (unchanged); mono name (ellipsis plus `title`); right side text (ellipsis plus `title`, `flexShrink: 0` with a max width); icon buttons Run (`Play`), Edit (`Edit`), Delete (`Trash`): vendored `Button kind="ghost" size="sm" icon=…` with no children, same `aria-label` keys (`evalsTab.runCaseName`, `editCaseName`, `deleteCase`) and the same handlers and disabled rules (G2 host rule included).
  - Line 2: mono text, `--text-secondary`, ellipsis, `title`. The errored text uses `title={record.error}`.
  - The inline per-case Run result and the alerts stay below, unchanged.
  - Status icon: `<span role="img" aria-label=…>` wrapping an `aria-hidden` lucide icon. Shapes differ: `CheckCircle` in `--ok`, `XCircle` in `--crit`, `AlertTriangle` in `--warn`, `Dot` in `--text-secondary`.
- **E7 Unused keys:** after the row change, `rg` for `evalsTab.runCase"`, `evalsTab.editCase"`, `evalsTab.delete"` call sites. Remove a key only when it has zero hits (the dialog's "Delete" button keeps `deleteConfirm.confirm`).

Open spec issues: none blocking. OQ-1 and OQ-2 are resolved by the defaults in E1. The spec status stays as approved; recording the defaults in the spec's Clarifications is a `spec-creator` follow-up, not part of this plan.

## 3. Architecture constraints

Same as G2 §3:
- The row logic is pure in `helpers.ts` (unit-tested without React); data lives in the colocated hook; the component only renders.
- `EvalCasesList` stays the single shared list for both tabs (no copy). The owner decides routes, through the G2 dispatchers.
- No new `lib/hooks` hook or key; reuse `useEvalRun` and the owner run-list dispatcher.
- Strings in `eval.json` `evalsTab.passingCount`, `evalsTab.runAll`, `evalsTab.row.*`; ICU plurals called with `count`.
- No server, contract, vendor or migration change (NG-2).

## 4. Contract changes

None (spec Contracts: n/a). No vendor sync, no migration.

## 5. Tasks

"Verify" = `cd client && pnpm typecheck && pnpm exec vitest run <files>`. `AE/` = `client/src/components/agent-evals/`. Skills key as in G2.

| # | Package | What to do | Files | Skills | AC | Test | Verify |
|---|---|---|---|---|---|---|---|
| T0 | client | Main session: G2 merged into the tree and green; baseline `scripts/check-all.sh`. | — | EI | support | baseline green | — |
| T1 | client | i18n keys, additive (list below). | `client/messages/en/eval.json` | FUA | NFR-3 | used by later tests | `pnpm exec vitest run src/test/smoke.test.tsx` |
| T2 | client | `referenceSuite` move (E2); pure helpers (E3). | `AE/helpers.ts`, `AE/helpers.test.ts`, `AE/EvalRunControl/{helpers.ts,EvalRunControl.tsx}`, `AE/EvalCasesList/{helpers.ts,helpers.test.ts}` | FUA | AC-1, 4, 5, 6 | `matchCount`: one intersecting plus one other file → 1; touching ranges (`end == start`) match; adjacent (`end + 1 == start`) do not; same lines but a different path string do not. `passingCount`: 20 cases, 17 passed → `{17,20}`; a case added after the suite counts in T only; a deleted case's record is ignored; no reference → null. `rowView` for passed, failed, error, no record and unavailable. `assertParts`: CRITICAL/security; only category; both empty → null; `must_not_flag` → assertEmpty. `referenceSuite` skips running and failed. | files listed |
| T3 | client | `useCaseResults(owner)` (E4). | `AE/EvalCasesList/hooks/useCaseResults.ts` | FUA, RBP | AC-8, AC-9, NFR-2 | covered by T5 component tests | `pnpm typecheck` |
| T4 | client | `EvalRunControl` `label`/`heading`/`actions` (E5); default rendering unchanged. | `AE/EvalRunControl/{EvalRunControl.tsx,styles.ts,EvalRunControl.test.tsx}` (append) | FUA, RBP, RTL | AC-2 | `label="runAll"` → button "Run all evals" (count not in the name), click opens the existing confirm with "Run 3 eval cases?"; with `heading` and `actions` the DOM order is heading, Run all evals, actions; notice below. Existing tests unedited ("Run eval (3)" default). | file listed |
| T5 | client | `EvalCasesList` row and heading (E5, E6), using `useCaseResults` and helpers. | `AE/EvalCasesList/{EvalCasesList.tsx,styles.ts,EvalCasesList.test.tsx}` | FUA, RBP, RTL | AC-1–AC-9 | new `describe("row status")`. **AC-1** 20 cases, reference with 17 passed → heading "Eval cases · 17/20 passing"; case added after → T counts it; only `failed` suites (EC-8) → "Eval cases". **AC-2** buttons in order "Run all evals", "New eval case"; no text "Run eval (". **AC-3** imgs "Passed", "Failed", "Errored", "Never run"; each wraps a different icon (assert distinct `svg` class or lucide name). **AC-4** "expected 1 finding, got 1 · src/a.ts:12"; must_not_flag "expected 0 findings, got 2 · …"; got 0. **AC-5** "never run · src/a.ts:12"; "errored · src/a.ts:12" with `title` = error. **AC-6** "CRITICAL · security"; "security"; "assert empty". **AC-7** buttons by the three names have empty `textContent`; click behaviour via existing tests. **AC-8** runs handler switches to a newer `done` suite after a tracked running suite finishes (fake timers or `findBy…{timeout:4000}`) → heading and icons update; a row Run result appears inline, icons and heading unchanged. **AC-9** hand-stubbed `500` on `GET /eval-runs/:id` → rows with badge, name, right side and buttons, no `role="img"` status, second line exactly "src/a.ts:12", heading "Eval cases"; the same while the runs query is pending. **NFR-2** 100 cases: all 100 rows; GET paths = cases, runs, one `/eval-runs/<ref>`, each once. Pre-existing tests stay green (the runs 404 makes them render the AC-9 state). | file listed |
| T6 | client | Remove the standalone `<EvalRunControl>` from both tabs (E5). | `…/AgentEditor/_components/EvalsTab/EvalsTab.tsx`, `client/src/app/skills/_components/SkillDetail/_components/SkillEvalsTab/SkillEvalsTab.tsx` | FUA | AC-2, AC-10 | T7 | files' tests |
| T7 | client | Tab tests. Agent `EvalsTab.test.tsx`: update only assertions the spec changes (label "Run all evals", control inside the cases heading); add an AC-10 parity test: the same fixture under the agent owner (`/agents/ag1/…`) and the skill owner (`/skills/s1/…`) gives identical heading text and row texts and icons, and requests go to the owner's routes. `SkillEvalsTab.test.tsx`: the run control is reached as "Run all evals" (update G2 queries). | `…/EvalsTab/EvalsTab.test.tsx`, `SkillEvalsTab/SkillEvalsTab.test.tsx`, `AE/EvalCasesList/EvalCasesList.test.tsx` (parity) | RTL | AC-2, AC-10, NFR-1 | as described; G2 AC-6/AC-8 assertions re-pointed to the new name only | files listed |
| T8 | client | Full check plus manual NFR-3: 120-char name, long path, long category at 1280 px on both tabs; keyboard pass over icon buttons (visible focus). | — | — | NFR-1, NFR-3 | full suite | `cd client && pnpm typecheck && pnpm exec vitest run`; `pnpm build` only when the main session has stopped `next dev` |
| T9 | client | Docs: `client/docs/eval-ui.md` `EvalCasesList` section (status icon, second line, right side, icon buttons, heading count, reference suite, `useCaseResults`, `EvalRunControl` heading-row mode, match rule) and the Evals tab stack order. After plan-verifier passes: `specs/eval-pipeline.md` G3 → implemented. | docs | — | support | links resolve | — |

Checklist form:
- [ ] T0 baseline → support
- [ ] T1 keys → NFR-3 → used in tests
- [ ] T2 helpers plus `referenceSuite` → AC-1, 4, 5, 6 → `AE/EvalCasesList/helpers.test.ts`, `AE/helpers.test.ts`
- [ ] T3 `useCaseResults` → AC-8, 9, NFR-2 → via T5
- [ ] T4 run-control heading mode → AC-2 → `EvalRunControl.test.tsx`
- [ ] T5 row plus heading → AC-1…AC-9, NFR-2 → `EvalCasesList.test.tsx`
- [ ] T6 drop standalone control → AC-2, AC-10 → T7
- [ ] T7 tab tests plus parity → AC-2, AC-10, NFR-1 → `EvalsTab.test.tsx`, `SkillEvalsTab.test.tsx`, `EvalCasesList.test.tsx`
- [ ] T8 full check plus manual → NFR-1, NFR-3
- [ ] T9 docs → support

### T1 key list (`eval.json`)

- `evalsTab.passingCount` "Eval cases · {passed}/{total} passing"
- `evalsTab.runAll` "Run all evals"
- `evalsTab.row.status.passed` "Passed"
- `evalsTab.row.status.failed` "Failed"
- `evalsTab.row.status.errored` "Errored"
- `evalsTab.row.status.neverRun` "Never run"
- `evalsTab.row.expected` "expected {count, plural, =0 {0 findings} one {# finding} other {# findings}}, got {got}" (called with `count` = 1 or 0)
- `evalsTab.row.neverRun` "never run"
- `evalsTab.row.errored` "errored"
- `evalsTab.row.withLocation` "{text} · {file}:{line}"
- `evalsTab.row.severityCategory` "{severity} · {category}"
- `evalsTab.row.assertEmpty` "assert empty"

Use "·" (U+00B7). Reused: `evalsTab.casesHeading`, `evalsTab.fileLine`, `evalsTab.runCaseName`, `editCaseName`, `deleteCase`, `evalsTab.kind.*`.

## 6. Execution

Single implementer: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. Then the main session runs `scripts/check-all.sh`, `pnpm build` (with dev stopped), `architecture-reviewer` and `plan-verifier`. T9 comes last.

Suggested commits:
1. keys plus helpers;
2. run-control heading mode;
3. rows plus tabs plus tests;
4. docs.

## 7. Test plan

- Per task: `cd client && pnpm typecheck && pnpm exec vitest run <files>`.
- End: full `pnpm exec vitest run` plus `pnpm typecheck`. The main session runs `scripts/check-all.sh` and decides on `pnpm build`. No Docker; no server tests.
- Test conventions:
  - `mockFetch` with handler functions holding mutable state for the AC-8 transition.
  - 500 or 409 via a hand `vi.stubGlobal("fetch")`.
  - Polling via `findBy…({ timeout: 4000 })` or `vi.useFakeTimers({ shouldAdvanceTime: true })` and `advanceTimersByTimeAsync(2100)`.
  - `TZ=UTC` pinned. `fireEvent` only.

## 8. Coverage matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 | T1, T2, T5 | `AE/EvalCasesList/helpers.test.ts` (`passingCount`); `EvalCasesList.test.tsx` (AC-1) | |
| AC-2 | T4, T5, T6, T7 | `EvalRunControl.test.tsx` (`runAll`, slots); `EvalCasesList.test.tsx`; `EvalsTab.test.tsx`; `SkillEvalsTab.test.tsx` | |
| AC-3 | T5 | `EvalCasesList.test.tsx` (AC-3) | |
| AC-4 | T2, T5 | `helpers.test.ts` (`matchCount` boundaries, `rowView`); `EvalCasesList.test.tsx` (AC-4) | |
| AC-5 | T2, T5 | `helpers.test.ts` (`rowView`); `EvalCasesList.test.tsx` (AC-5) | |
| AC-6 | T2, T5 | `helpers.test.ts` (`assertParts`); `EvalCasesList.test.tsx` (AC-6) | |
| AC-7 | T5 | `EvalCasesList.test.tsx` (AC-7) plus pre-existing click tests | |
| AC-8 | T3, T5 | `EvalCasesList.test.tsx` (AC-8) | |
| AC-9 | T3, T5 | `EvalCasesList.test.tsx` (AC-9) | |
| AC-10 | T6, T7 | parity test (`EvalCasesList.test.tsx`), `EvalsTab.test.tsx`, `SkillEvalsTab.test.tsx` | |
| NFR-1 | T5, T7, T8 | role/name queries; manual keyboard and focus | |
| NFR-2 | T3, T5 | `EvalCasesList.test.tsx` (100 cases, request set) | |
| NFR-3 | T1, T8 | key use in tests; manual long names at 1280 px | |

## 9. Risks and known traps

- **R1 G2 must land first:** T5 depends on the G2 owner dispatcher and the promoted `EvalCasesList`. Do not start G3 on a tree without G2 T1–T14.
- **R2 Per-agent page unaffected** (NG-5): `EvalRunControl`'s default label stays "Run eval (n)"; `AgentHeader` and `AgentEvalPage` tests must stay unedited.
- **R3 AC-9 vs existing tests:** pre-existing `EvalCasesList` tests do not route `GET /agents/ag1/eval-runs`, so it returns 404 and they render the unavailable state (no icons, second line `file:line`). This is intended. Do not "fix" it by routing runs in those tests.
- **R4 Vendored `Button`** has no `title` or `ref` forwarding. Icon-only buttons rely on `aria-label` (spread). Lucide icons need explicit `aria-hidden="true"` inside the `role="img"` status span.
- **R5 Status by shape, not colour** (WCAG): four different icons plus text names; the second line is text.
- **R6 jsdom:** the `var()` border shorthand is dropped (assert longhands); the active-variant shorthand rule applies (INSIGHTS 2026-10-07). Use `getByRole("img", { name })` rather than colour.
- **R7 ICU:** `evalsTab.row.expected` must be called with a numeric `count`, or the plural stays "1 findings" (INSIGHTS 2026-10-01).
- **R8 Look-alike characters:** use U+00B7 "·" consistently in keys and test strings (INSIGHTS 2026-08-01 thin-space lesson).
- **R9 Polling:** `useEvalRun` polls every 2 s only while running. The AC-8 test needs either `findBy` with a timeout or fake timers wrapped in `act`.
- **R10 Long values** (NFR-3, INSIGHTS 2026-09-26): name, second line and right side each need `nowrap` plus `overflow: hidden` plus `textOverflow: ellipsis` plus `minWidth: 0`, with a `title`.
- **R11** `pnpm build` while `next dev` runs corrupts `.next`; the main session decides.

## 10. Handoff

**Do not touch:** `client/src/vendor/**`; `server/**`, `reviewer-core/**`, `e2e/**`, `devdigest-mcp/**`, `evals/**`; migrations; lockfiles; `server/clones/**`; `client/src/app/eval/**` (dashboard and per-agent page, NG-5); `EvalRunHistory`, `EvalCompare`, `RegressionBanner` (NG-5); `client/src/lib/hooks/eval.ts` beyond what G2 added (no new hook or key); spec bodies.

**For `architecture-reviewer`:**
- Row rules are pure in `AE/EvalCasesList/helpers.ts`.
- `useCaseResults` is colocated.
- `referenceSuite` lives in `AE/helpers.ts`, with no import across component folders.
- One shared `EvalCasesList` for both tabs.
- No `fetch` in components.

**Security:** no new input; texts are escaped. Nothing to review.
