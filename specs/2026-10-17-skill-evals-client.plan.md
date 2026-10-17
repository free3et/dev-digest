# Implementation Plan: Skill evals — Evals tab and "Run on evals" on the Skills page (client)

Spec: `specs/2026-10-17-skill-evals-client.md` · Spec ID: SPEC-2026-10-17-skill-evals-client · Spec status: approved (user, 2026-10-17) · Mode: single · Packages: client

Written by `implementation-planner`, saved by the main session. AC IDs are this spec's (G2). G1 is implemented in `db844c5`. Its contracts are already in `client/src/vendor/shared` and identical to the server copy.

## 1. Context consulted

- Spec G2 plus G1 (`specs/2026-10-17-skill-evals-server.md`: refusal tables R-G1…R-G3, `EvalSuiteRun.owner_kind/skill_id/skill_version`, `EvalDryRunRequest.agent_id`, `EvalSuiteStartRequest`, `EvalCaseCopyRequest`). Also the G1 plan and the Spec F plan for format.
- `client/docs/eval-ui.md`: Evals tab, the shared `AE/` parts, hooks table, compare dialog, `useDialogA11y`.
- `client/INSIGHTS.md` entries relied on:
  - 2026-10-07: the tab parser must accept a new tab; test it against every key.
  - 2026-10-01: a namespace must be registered in `src/test/render.tsx`. `skills` and `eval` already are. ICU plurals need `count`.
  - 2026-10-06: `mockFetch` answers only 200 or 404. Use a hand `vi.stubGlobal("fetch")` for 409/422/429.
  - 2026-09-19: `@devdigest/ui` `SelectInput`/`Textarea` have no `id`/`aria-label`, so use native controls with `useId()` and a label `htmlFor`. Mock `next/navigation` with a `useSyncExternalStore` search-params store.
  - 2026-10-16: pin `TZ=UTC`.
  - 2026-10-01: `pnpm build` while `next dev` runs breaks `.next`.
- Code facts:
  - Skill detail: `SkillDetail.tsx:24-57` (header has no actions, `Tabs` from `@devdigest/ui`), `constants.ts:1-11`, `helpers.ts:4-6`, `SkillsView.tsx:32,92-98` (`SkillDetail` not keyed by skill id).
  - Vendored `Tabs` (`client/src/vendor/ui/kit/Tabs.tsx`) renders plain `<button>`s with no `role="tab"`.
  - Vendored `Button` spreads `...rest`, so `aria-describedby` and `aria-label` pass through.
  - Agent tab: `EvalsTab.tsx:15-33`; `EvalCasesList.tsx:25-172` (local `refusalKey`, per-row Run, Edit, Delete); `CaseEditorDialog.tsx:22-226` (Run case only when editing; "Run on save"; errors through `modalErrorKey`).
  - Shared parts: `EvalRunControl.tsx:14-113` and `helpers.ts:4-43`; `EvalRunHistory.tsx:15-128`; `RegressionBanner.tsx:17-50` and `helpers.ts:41-63` (version = `agent_version`); `EvalCompare.tsx:23-119`; `PromptDiff.tsx:15-112`; `CompareRunInfo.tsx:12-61`.
  - Hooks: `client/src/lib/hooks/eval.ts:25-195` (all agent-keyed; `useEvalRun` invalidates `["eval-runs", agent_id]` at `:155-163`); `useAgents` at `client/src/lib/hooks/agents.ts:8`; `useSkillStats` at `client/src/lib/hooks/skill-stats.ts:8` (key `["skill-stats", id]`); `useSkillVersions` at `client/src/lib/hooks/skills.ts:84`.
  - i18n: `client/messages/en/eval.json` (`evalsTab.*` refusal texts say "this agent"; `caseEditor.errors.*`; `compare.*`); `client/messages/en/skills.json` `detail.tabs.*`.

## 2. Decisions (plan-only; none changes the spec)

- **D1 Promote, don't copy.** `T1` moves `EvalCasesList/` (with `CaseEditorDialog/`, `styles.ts`, `index.ts` and `EvalCasesList.test.tsx`) from `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/` to `client/src/components/agent-evals/EvalCasesList/` using `git mv`. Only import specifiers change. The folder keeps its name `agent-evals` (frontend-ui-architecture "Known tension": do not rename).
- **D2 Owner props keep agent callers unchanged.** Each shared component (`EvalRunControl`, `EvalCasesList`, `CaseEditorDialog`, `RegressionBanner`, `EvalRunHistory`, `EvalCompare`) accepts `{ agentId: string }` (exactly as today) or `{ owner: EvalOwner }`. They resolve this with `resolveOwner(props)` in `AE/helpers.ts`. Every existing agent call site and test stays byte-identical (AC-14).
  - Types live in `client/src/lib/hooks/eval.ts`: `EvalOwner = { kind: "agent" | "skill"; id: string }` and `EvalHost = { id: string; name: string; model: string }`.
  - Run-capable components (`EvalRunControl`, `EvalCasesList`, `CaseEditorDialog`) also take `host?: EvalHost | null`. It matters only when `owner.kind === "skill"`; `null` disables running there.
  - History and compare take `hosts?: ReadonlyMap<string, EvalHost>`, built by the skill tab from `useAgents`. Shared parts therefore never issue an `/agents` request on the agent tab (AC-14, NFR-3).
- **D3 Hooks (`client/src/lib/hooks/eval.ts`).** Existing agent hooks keep their signatures, keys and requests.
  - New skill hooks:
    - `useSkillEvalCases(skillId)`, key `["skill-eval-cases", id]`.
    - `useSkillEvalRuns(skillId)`, key `["skill-eval-runs", id]`.
    - `useStartSkillEvalRun(skillId)`: `mutate(agentId)` sends `POST /skills/:id/eval-runs` with `{ agent_id }`. On success it prepends the created suite into `["skill-eval-runs", id]` via `setQueryData`, then invalidates that key, so the tab adopts the run at once (AC-9, EC-9). It does not touch `["eval-dashboard"]` (G1 C-5).
    - `useCreateSkillManualEvalCase(skillId)`: `POST /skills/:id/eval-cases`.
    - `useCopyEvalCaseToSkill(skillId)`: `POST /skills/:id/eval-cases/copy` with `{ case_id }`.
    - `useAgentCasesForCopy(agentIds, enabled)`: `useQueries` over `["eval-cases", agentId]`, sharing the agent cache.
  - Owner dispatchers `useOwnerEvalCases(owner)` and `useOwnerEvalRuns(owner)` call the agent and skill hooks with `null` for the inactive kind, so the disabled query sends nothing.
  - `useDeleteEvalCase` and `useUpdateEvalCase` accept `EvalOwner | string | null` (a string means agent id, so current call sites and `client/src/lib/hooks/eval.test.tsx` stay unchanged) and invalidate the owner's cases key. `useCreateManualEvalCase(agentId)` is unchanged.
  - `useRunEvalCase` variables gain optional `agentId`. The body includes `agent_id` only when it is given; the agent body (`{}` or `{expected_output}`) is unchanged.
  - `useEvalRun`: on leaving `running`, a skill suite (`owner_kind === "skill"`) invalidates `["skill-eval-runs", skill_id]` only. An agent suite keeps today's two invalidations. This is the bug in finding 1 above.
  - When a skill start or a case run fails with code `host_not_found`, the hook invalidates `["agents"]` (EC-3).
- **D4 Host state** lives in `SkillDetail`, through a colocated hook `client/src/app/skills/_components/SkillDetail/hooks/useSkillEvalHost.ts`.
  - It reads `useAgents()`, `useSkillEvalRuns(skillId)` and `useSkillStats(skillId)`. It keeps the explicit choice as `{ skillId, agentId: string | null } | null` and ignores a stored choice whose `skillId` differs from the current one, because `SkillDetail` is not keyed by skill.
  - The preset comes from a pure `presetHostId({ suites, statsAgents, agents })` in `SkillDetail/helpers.ts`:
    1. the newest suite's `agent_id` if that id is in `agents`;
    2. else the first `statsAgents` entry whose id is in `agents`;
    3. else `null`.
    A stats error skips branch 2. While agents are loading, the host is `null`, so running is disabled.
  - Returns `{ agents, hosts: Map, hostId, host: EvalHost | null, setHostId }`. Header and tab share one instance.
- **D5 Header button.** `SkillDetail/_components/RunOnEvalsButton/` uses `useSkillEvalCases`, `useSkillEvalRuns`, `useEvalRun(runningRun?.id)` (same key as the tab's control, so it polls once), `useStartSkillEvalRun` and the shared confirmation (D6).
  - Disabled reasons, first match wins: running → `detail.runOnEvals.disabledRunning`; no cases → `disabledNoCases`; no host → `disabledNoHost`. Each reason is a `VISUALLY_HIDDEN` span referenced by `aria-describedby`, plus a `title`.
  - On confirm success it calls `onTabChange("evals")`.
  - A refusal shows an inline `role="alert"` text next to the button (AC-11); the button re-enables.
  - Placement: a right-aligned group (`marginLeft: "auto"`, `flexShrink: 0`). The skill name keeps its ellipsis (`minWidth: 0`).
- **D6 Shared confirmation.** Extract the inline `Modal` of `EvalRunControl` into `AE/EvalRunConfirm/` (props: `count`, `lastCost`, `host?: EvalHost`, `onConfirm`, `onCancel`).
  - The agent path renders the same title, body and buttons as today; `EvalRunControl.test.tsx` stays unedited.
  - With a host, the body is `skillEvals.confirm.body`, naming the host and model. Cost is the last finished skill suite's `formatCostUsd` ("—" when none).
- **D7 Refusals.** `skillRefusalKey(err)` in `AE/helpers.ts` maps `ApiError.code` ∈ {`host_required`, `host_not_found`, `host_not_allowed`, `not_agent_case`, `eval_run_in_progress`, `no_cases`, `too_many_cases`, `invalid_diff`, `not_found`}, then status 429 → `rate_limited`, status 0 or a non-ApiError → `network_error`, else `unknown`. Texts are in `skillEvals.refusals.*`.
  - Agent paths keep `evalsTab.refusals.*` unchanged.
  - `CaseEditorDialog` with a skill owner shows `skillEvals.refusals.*` for known codes, through a pure `editorErrorKey(owner, err)` in `CaseEditorDialog/helpers.ts`. The agent owner keeps `modalErrorKey`.
- **D8 Editor for skills.** With a skill owner:
  - "Run case" also needs a host.
  - "Run on save" is disabled and off when there is no host.
  - Every run passes `agentId: host.id`.
  - A new case goes through `useCreateSkillManualEvalCase`; an edit goes through `useUpdateEvalCase(owner)` (AC-3, AC-7).
- **D9 History and banner.**
  - `EvalRunHistory` with a skill owner shows the version cell from `skill_version` and adds a "Host" column after Version (`history.columns` stays; the new key is `skillEvals.history.host`). The cell is `skillEvals.history.hostCell` "{name} v{version}". When `hosts` is loaded but lacks the id, it reads `skillEvals.history.deletedAgent`. While `hosts` is undefined it shows `EMPTY`. The cell is ellipsized and carries a `title`.
  - `regressionBanner(runs, versionOf?)` gains an optional version getter (default `agent_version`). The skill owner passes `skill_version ?? agent_version`.
  - The compare-hint id becomes `eval-compare-hint-${owner.kind}-${owner.id}` for skills only; agents keep the current id.
- **D10 Compare.**
  - With a skill owner, the title is `compare.titleWithVersions` with `skill_version`s.
  - Subtitles are `skillEvals.compare.subtitleCaseSet` / `subtitleDifferentSets`.
  - `PromptDiff` is replaced by `SkillBodyDiff`. Extract the presentational list and legend of `PromptDiff` into `AE/EvalCompare/LineDiff/` (props: `title`, `versionA`, `versionB`, `textA?`, `textB?`, `loading`, `error`, `sameText`). `PromptDiff` keeps its behaviour and existing tests.
  - `SkillBodyDiff` reads `useSkillVersions(skillId)` and picks bodies by version number. With the same `skill_version` it shows "Same skill body" (EC-6).
  - A host-changed note `<p role="note">` with `skillEvals.compare.hostChanged` appears only when `agent_id` or `agent_version` differ. Names come from `hosts`, else `deletedAgent`.
  - `CompareRunInfo` with a skill owner labels the version row "Skill version" (skill versions) and adds a "Host" row (same cell as D9). This presents existing data; it adds no AC.
- **D11 Copy picker.** Under `client/src/app/skills/_components/SkillDetail/_components/SkillEvalsTab/CopyCaseDialog/`, a button "Copy from agent case" opens a portalled `Modal` with `useDialogA11y`.
  - It is mounted only while open, so agent cases are fetched only then (NFR-3).
  - One `<section aria-labelledby>` per agent: an `h4` with the agent name (ellipsis and `title`) and a list of buttons named `skillEvals.copy.caseName` "Copy eval case “{name}”".
  - A click sends the copy request. On success it closes and the skill list refetches. On refusal it shows an inline `role="alert"` with the `skillRefusalKey` text and stays open.
  - Agents without cases are omitted. Nothing at all → `skillEvals.copy.empty`.
  - `EvalCasesList` gets an `extraActions?: ReactNode` slot rendered after "New eval case", so the shared list holds no skill code.
- **D12 Host picker** under `SkillEvalsTab/HostPicker/`: a native `<select>` with `<label htmlFor>` "Host agent".
  - The first option, `value=""`, is "No agent"; then one option per agent, `skillEvals.host.option` "{name} · {model}", in `GET /agents` order. A `title` holds the selected label.
  - With no host, `<p id=hintId>` shows `skillEvals.host.hint`. Per-row Run and the run control reference it through `aria-describedby` via a `runHintId` prop.
- **D13 Tab.** `SKILL_TABS` gains `"evals"` after `"context"`, with icon `FlaskConical` (same as the agent editor). The tab label is `skills.detail.tabs.evals`. The vendored `Tabs` has no `role="tab"`, so tests query `getByRole("button", { name: "Evals" })`. `client/src/vendor/**` is not edited.
- **D14 Empty text.** `EvalCasesList` with a skill owner uses `skillEvals.emptyCases`.

Open spec issues: none.

## 3. Architecture constraints

- frontend-ui-architecture placement:
  - Single-route parts in `client/src/app/skills/_components/SkillDetail/_components/{SkillEvalsTab,RunOnEvalsButton}/`, with children nested (`HostPicker/`, `CopyCaseDialog/`).
  - Parts used by two routes in `client/src/components/agent-evals/`.
  - No route imports another route's `_components`. `lib/` never imports `components/` or `app/`. No new barrels beyond each folder's own `index.ts`. Tests are siblings.
- Components never call `fetch`; every request goes through `client/src/lib/hooks/eval.ts`. Pure rules (`presetHostId`, `resolveOwner`, `skillRefusalKey`, `editorErrorKey`, banner version getter) live in `helpers.ts` with unit tests. State lives in the colocated hook.
- Strings only from `messages/en/{eval,skills}.json`, with `camelCase` keys nested by section. Plurals use `t(key, { count })`. No inline strings in JSX.
- `import type` from `@devdigest/shared`. Server state stays in TanStack Query and is never mirrored into `useState`; only the explicit host choice is local state.
- Untrusted text (case names, agent names, skill bodies, error texts) is rendered as React text, `title` or `aria-label` only. The diff renders through the same `LineDiff` markup as `PromptDiff`.

## 4. Contract changes

None. G1 contracts are already in `client/src/vendor/shared` and identical to the server copy (checked with `diff -q`). No vendor sync, no server change, no migration.

## 5. Tasks

"Verify" for each task is `cd client && pnpm typecheck && pnpm exec vitest run <files>` (equivalent: `scripts/check-pkg.sh client <files>`). `AE/` = `client/src/components/agent-evals/`; `SD/` = `client/src/app/skills/_components/SkillDetail/`.

Skills key: FUA = `frontend-ui-architecture`, RBP = `react-best-practices`, NBP = `next-best-practices`, RTL = `react-testing-library`, EI = `engineering-insights` (read at start of T0, read-only).

| # | Package | What to do | Files | Skills | AC | Test | Verify |
|---|---|---|---|---|---|---|---|
| T0 | client | Main session: baseline `scripts/check-all.sh`; `git status` clean on `hw6-evals`. | — | EI | support | baseline green | — |
| T1 | client | **Move alone, as a gate (D1).** `git mv` `EvalCasesList/` to `AE/EvalCasesList/`. Change only import specifiers: `EvalsTab.tsx` → `@/components/agent-evals/EvalCasesList`; the messages import in `EvalCasesList.test.tsx:4` gets the new relative depth. Do not edit any assertion. | `AE/EvalCasesList/**`, `…/EvalsTab/EvalsTab.tsx` | FUA | support (AC-14) | moved test plus `EvalsTab.test.tsx` unedited and green; `rg "EvalsTab/EvalCasesList" client/src` empty | `pnpm typecheck && pnpm exec vitest run` (full) |
| T2 | client | i18n keys, additive (list below). | `client/messages/en/eval.json`, `client/messages/en/skills.json` | FUA | NFR-2 | used by later tests | `pnpm exec vitest run src/test/smoke.test.tsx` |
| T3 | client | Hooks and types (D3). | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.tsx` (append only) | FUA, RBP, RTL | AC-2, 3, 4, 7, 8, 12 (support), NFR-3 | skill keys and paths; start body `{agent_id}` plus prepend into the skill runs cache; copy body `{case_id}`; run body has `agent_id` only when given (agent body unchanged); skill suite leaving `running` invalidates `["skill-eval-runs", sid]` and not `["eval-runs", host]`; `host_not_found` invalidates `["agents"]`; existing hook tests unedited | `pnpm exec vitest run src/lib/hooks/eval.test.tsx` |
| T4 | client | AE helpers: `resolveOwner`, `skillRefusalKey` (D7), `runVersion(run, kind)`, `hostCellText`-style pure mapper `hostLabel(hosts, agentId, version)` → `{kind:"known",name,version}` / `{kind:"deleted"}` / `{kind:"loading"}`; `regressionBanner` optional getter (D9). | `AE/helpers.ts`, `AE/helpers.test.ts`, `AE/RegressionBanner/helpers.ts`, `AE/RegressionBanner/helpers.test.ts` (append) | FUA | AC-11, AC-12 | every G1 code maps; 429, status 0 and non-ApiError cases; banner with getter uses `skill_version`; default unchanged | files listed |
| T5 | client | Tab constants and parser (D13). Update `SD/helpers.test.ts`: replace the `"evals" → "config"` assertion (the spec amends it); iterate over every `SKILL_TABS` key; unknown `"nope"` and null fall back to config. | `SD/constants.ts`, `SD/helpers.test.ts` | FUA | AC-1 | `parseSkillTab("evals") === "evals"`; every key round-trips | files listed |
| T6 | client | `EvalCasesList` and `CaseEditorDialog` owner and host (D2, D7, D8, D11 slot, D14). The skill owner uses the owner dispatchers and skill mutations; row Run is disabled without a host and gets `aria-describedby={runHintId}`; delete invalidates the owner key. Add host codes to the dialog's error mapping via `editorErrorKey`. | `AE/EvalCasesList/{EvalCasesList.tsx,EvalCasesList.test.tsx}`, `AE/EvalCasesList/CaseEditorDialog/{CaseEditorDialog.tsx,helpers.ts,helpers.test.ts}` | FUA, RBP, RTL | AC-2, 3, 6, 7, 11 | append a `describe("skill owner")` (existing tests unedited). Lists from `GET /skills/s1/eval-cases`; "Must find" badge; Delete confirm then `DELETE /eval-cases/:id` and refetch of the skill list; empty text "No eval cases for this skill yet…"; error state Retry; New case → `POST /skills/s1/eval-cases` with body `{name,patch,expected_output}` and list refetched; Edit → `PATCH /eval-cases/c1`; row Run and editor "Run case" carry `agent_id: "h1"`; `host={null}` makes row Run disabled; hand-stubbed `422 host_not_found` on row Run → text, button re-enabled. Helper tests for `editorErrorKey`. | files listed |
| T7 | client | Extract `AE/EvalRunConfirm/` (D6). `EvalRunControl` owner and host: the skill owner uses skill cases, runs and start; disabled when `n===0` or no host; refusals via `skillRefusalKey`; `aria-describedby={runHintId}` when no host. | `AE/EvalRunConfirm/{EvalRunConfirm.tsx,index.ts}`, `AE/EvalRunControl/{EvalRunControl.tsx,EvalRunControl.test.tsx}` | FUA, RBP, RTL | AC-6, 8, 11, NFR-4 | append skill tests. Confirm text has case count, "Reviewer A · gpt-x" and last cost "—" or `$0.01`; zero POSTs before confirm; Cancel → zero POSTs; Confirm → exactly one `POST /skills/s1/eval-runs` body `{agent_id:"h1"}`; `host={null}` → disabled; hand-stubbed `409 eval_run_in_progress` → skill text, button usable. Existing agent tests unedited. | files listed |
| T8 | client | `EvalRunHistory` and `RegressionBanner` owner plus `hosts` (D9). | `AE/EvalRunHistory/{EvalRunHistory.tsx,EvalRunHistory.test.tsx}`, `AE/RegressionBanner/{RegressionBanner.tsx,RegressionBanner.test.tsx}` | FUA, RBP, RTL | AC-12 | append. Rows from `GET /skills/s1/eval-runs`; version cell "v3" from `skill_version`; column header "Host"; cell "Reviewer A v7"; unknown id → "Deleted agent"; banner "…dipped 2 pts on v3." from skill versions; no `/agents/` request from these components | files listed |
| T9 | client | Compare (D10): extract `LineDiff`; add `SkillBodyDiff`; owner/hosts on `EvalCompare` and `CompareRunInfo`; host-changed note. | `AE/EvalCompare/{EvalCompare.tsx,EvalCompare.test.tsx}`, `AE/EvalCompare/LineDiff/{LineDiff.tsx,index.ts}`, `AE/EvalCompare/PromptDiff/PromptDiff.tsx`, `AE/EvalCompare/SkillBodyDiff/{SkillBodyDiff.tsx,index.ts}`, `AE/EvalCompare/CompareRunInfo/CompareRunInfo.tsx` | FUA, RBP, RTL | AC-13 | append. Title "Compare runs · v2 → v3"; "Skill body diff" from stubbed `GET /skills/s1/versions` (added and removed lines after Show diff); no `GET /agents/…/versions/…`; same host → no note; different `agent_version` → "Host changed: Reviewer A v6 → Reviewer A v7"; same skill version and different host → "Same skill body" plus the note (EC-6). Existing agent compare tests unedited. | files listed |
| T10 | client | `presetHostId` and `useSkillEvalHost` (D4). | `SD/helpers.ts`, `SD/helpers.test.ts`, `SD/hooks/useSkillEvalHost.ts` | FUA, RBP | AC-5 | unit: newest suite's agent exists → it; suite agent deleted → first stats agent that exists; no suites and no stats agents → null; stats error → skip; no agents → null | files listed |
| T11 | client | `HostPicker` (D12). | `SD/_components/SkillEvalsTab/HostPicker/{HostPicker.tsx,index.ts,styles.ts,HostPicker.test.tsx}` | FUA, RBP, RTL | AC-5, AC-6, NFR-1 | combobox named "Host agent"; options "No agent", "Reviewer A · gpt-x", …; change calls `onChange(id)`; "" → `null`; hint text when `value===null`; a long name has `title` | files listed |
| T12 | client | `CopyCaseDialog` and its open button (D11). | `SD/_components/SkillEvalsTab/CopyCaseDialog/{CopyCaseDialog.tsx,index.ts,styles.ts,CopyCaseDialog.test.tsx}` | FUA, RBP, RTL | AC-4 | dialog named; groups per agent (`within(group named "Reviewer A")`); no `GET /agents/*/eval-cases` before open; click → `POST /skills/s1/eval-cases/copy` body `{case_id:"c1"}`, dialog closes, `GET /skills/s1/eval-cases` refetched; hand-stubbed `422 not_agent_case` → text, stays open; empty → `copy.empty` | files listed |
| T13 | client | `SkillEvalsTab({ skill, hostState })` composition, mirroring `EvalsTab`: title and subtitle, `HostPicker`, `EvalRunControl`, `EvalCasesList extraActions={<CopyCaseDialog …/>}`, `RegressionBanner`, `EvalRunHistory hosts`, `EvalCompare hosts` while `compareIds` is set. | `SD/_components/SkillEvalsTab/{SkillEvalsTab.tsx,index.ts,styles.ts,SkillEvalsTab.test.tsx}` | FUA, RBP, RTL | AC-2, 5, 6, 7, 8, 12, 13, NFR-1, NFR-3, NFR-4 | integration through `SkillDetail` with `tab="evals"`. Three preset fixtures (AC-5) select the expected option; no agents → run control and row Run disabled plus hint (AC-6); Run row → `agent_id` (AC-7); Compare two runs → skill title. NFR-3: sorted set of GET paths on open is exactly `/agents`, `/skills/s1/eval-cases`, `/skills/s1/eval-runs`, `/skills/s1/stats`, each once (no running suite). No `POST` without confirm. | files listed |
| T14 | client | `RunOnEvalsButton` (D5) and `SkillDetail` header and tab: call `useSkillEvalHost`, render the button in the head and `SkillEvalsTab` when `tab === "evals"`; update the file header comment. | `SD/_components/RunOnEvalsButton/{RunOnEvalsButton.tsx,index.ts,styles.ts,RunOnEvalsButton.test.tsx}`, `SD/SkillDetail.tsx`, `SD/styles.ts`, `client/src/app/skills/_components/SkillsView/SkillsView.test.tsx` (append) | FUA, RBP, NBP, RTL | AC-1, 6, 8, 9, 10, 11 | button "Run on evals" on Config; running suite → disabled with accessible description "An eval run is in progress"; 0 cases → "Add an eval case first"; no agents → disabled plus "Pick an agent…"; confirm → one POST then `onTabChange("evals")`; `409` hand stub → inline text, button usable. In `SkillsView.test.tsx` with the existing nav mock: `?id=s1&tab=config` → Run on evals → confirm → `nav.replace` to `tab=evals`, progress "0 / 2 cases" visible; `?tab=evals` → button "Evals" present and the Evals body shown (AC-1). | files listed |
| T15 | client | AC-14 guard: run the agent, dashboard and per-agent tests unedited. Append one test to `EvalsTab.test.tsx`: no recorded call path starts with `/skills/` and no `/agents` list request. | `…/EvalsTab/EvalsTab.test.tsx` (append) | RTL | AC-14 | `EvalsTab`, `EvalCasesList`, `EvalRunControl`, `EvalRunHistory`, `RegressionBanner`, `EvalCompare`, `AgentEvalPage*`, `EvalDashboard*`, `RecentRuns`, `client/src/lib/hooks/eval.test.tsx`: zero edits to pre-existing assertions (`git diff` shows only appended blocks) | `pnpm exec vitest run src/app/agents src/app/eval src/components/agent-evals src/lib/hooks` |
| T16 | client | Full check, plus manual NFR-2 (80-character skill, agent and model names at 1280 px: header, picker, history, compare), keyboard pass (tab, picker, Copy, Run on evals). | — | — | NFR-1, NFR-2 | full suite | `cd client && pnpm typecheck && pnpm exec vitest run`; `pnpm build` only if the main session has stopped `next dev` |
| T17 | client | Docs: `client/docs/eval-ui.md` (Surfaces mermaid plus table: Skills Evals tab, Run on evals, owner props, skill hooks and keys, the `useEvalRun` owner-aware invalidation, `SkillBodyDiff`, host note; Sources plus G2 and this plan); `client/README.md` route map (`/skills?tab=evals` → `/skills/:id/eval-*`). After plan-verifier passes: `specs/eval-pipeline.md` G2 → implemented. | docs | — | support | links resolve | — |

Checklist form:
- [ ] T0 baseline → support
- [ ] T1 promote `EvalCasesList` → support (AC-14) → full suite unedited
- [ ] T2 i18n keys → NFR-2 → used in tests
- [ ] T3 skill hooks, owner dispatch, owner-aware `useEvalRun` → AC-2/3/4/7/8/12 support, NFR-3 → `client/src/lib/hooks/eval.test.tsx`
- [ ] T4 AE helpers → AC-11, AC-12 → `AE/helpers.test.ts`, banner helpers test
- [ ] T5 tab plus parser → AC-1 → `SD/helpers.test.ts`
- [ ] T6 case list and editor owner → AC-2, 3, 6, 7, 11 → `EvalCasesList.test.tsx`, `CaseEditorDialog/helpers.test.ts`
- [ ] T7 confirm extraction plus run control owner → AC-6, 8, 11, NFR-4 → `EvalRunControl.test.tsx`
- [ ] T8 history plus banner → AC-12 → `EvalRunHistory.test.tsx`, `RegressionBanner.test.tsx`
- [ ] T9 compare → AC-13 → `EvalCompare.test.tsx`
- [ ] T10 preset plus host hook → AC-5 → `SD/helpers.test.ts`
- [ ] T11 host picker → AC-5, 6, NFR-1 → `HostPicker.test.tsx`
- [ ] T12 copy dialog → AC-4 → `CopyCaseDialog.test.tsx`
- [ ] T13 skill tab → AC-2, 5–8, 12, 13, NFR-1, 3, 4 → `SkillEvalsTab.test.tsx`
- [ ] T14 header button plus wiring → AC-1, 6, 8–11 → `RunOnEvalsButton.test.tsx`, `SkillsView.test.tsx`
- [ ] T15 regression guard → AC-14 → agent suites unedited plus `EvalsTab.test.tsx` no-`/skills/` test
- [ ] T16 full check plus manual → NFR-1, NFR-2
- [ ] T17 docs → support

### T2 key list

`skills.json`:
- `detail.tabs.evals` "Evals"
- `detail.runOnEvals.label` "Run on evals"
- `detail.runOnEvals.disabledRunning` "An eval run is in progress"
- `detail.runOnEvals.disabledNoCases` "Add an eval case first"
- `detail.runOnEvals.disabledNoHost` "Pick an agent to run this skill's evals"

`eval.json` `skillEvals`:
- `title` "Skill evals"
- `subtitle` "Recall / Precision / Citation for this skill's eval cases, run through a host agent"
- `host.label` "Host agent"
- `host.none` "No agent"
- `host.option` "{name} · {model}"
- `host.hint` "Pick an agent to run this skill's evals"
- `emptyCases` "No eval cases for this skill yet. Write one by hand or copy an agent's case."
- `confirm.body` "Runs on {host} · {model}. This calls the model once per case. Last finished run cost: {cost}."
- `copy.open` "Copy from agent case"
- `copy.title` "Copy an agent's eval case"
- `copy.subtitle` "The copy belongs to this skill; the agent's case stays unchanged"
- `copy.caseName` "Copy eval case “{name}”"
- `copy.loading` "Loading cases…"
- `copy.empty` "No agent has eval cases yet."
- `copy.loadError` "Couldn’t load the agents' cases."
- `copy.close` "Close"
- `refusals.host_required` "Pick a host agent first (host_required)."
- `refusals.host_not_found` "The host agent no longer exists. Pick another one (host_not_found)."
- `refusals.host_not_allowed` "This case belongs to an agent and runs on it (host_not_allowed)."
- `refusals.not_agent_case` "Only an agent's case can be copied (not_agent_case)."
- `refusals.eval_run_in_progress` "A run of this skill is already in progress (eval_run_in_progress)."
- `refusals.no_cases` "This skill has no eval cases (no_cases)."
- `refusals.too_many_cases` "This skill has 100 eval cases, the maximum (too_many_cases)."
- `refusals.invalid_diff` "The diff must contain at least one @@ hunk (invalid_diff)."
- `refusals.not_found` "Skill or case not found (not_found)."
- `refusals.rate_limited` "Too many requests. Try again in a minute (rate_limited)."
- `refusals.network_error` "Could not reach the server. Check the connection and retry."
- `refusals.unknown` "The request failed."
- `history.host` "Host"
- `history.hostCell` "{name} v{version}"
- `history.deletedAgent` "Deleted agent"
- `compare.subtitleCaseSet` "Old skill body vs new — metric deltas and body diff on the {count}-case set"
- `compare.subtitleDifferentSets` "Old skill body vs new — metric deltas and body diff on different case sets"
- `compare.skillVersion` "Skill version"
- `compare.host` "Host"
- `compare.hostChanged` "Host changed: {a} v{va} → {b} v{vb}"
- `compare.bodyDiff.title` "Skill body diff"
- `compare.bodyDiff.same` "Same skill body"
- `compare.bodyDiff.loading` "Loading skill versions…"
- `compare.bodyDiff.loadError` "Couldn’t load the skill versions."

Show and Hide reuse `compare.promptDiff.show` / `hide`. Use "·" (U+00B7) and "—" (U+2014). Both namespaces are already registered in `client/src/test/render.tsx`.

## 6. Execution

Single implementer, in order: T0 (main session) → **T1 alone as a gate** (full suite green, zero assertion edits) → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14 → T15 → T16. Then the main session runs `scripts/check-all.sh`, `pnpm build` (with `next dev` stopped), `architecture-reviewer` and `plan-verifier`. T17 comes last.

Suggested commits:
1. move;
2. keys, hooks and helpers;
3. shared parts owner-aware (T6–T9);
4. skill tab, picker, copy, header (T10–T14);
5. guard;
6. docs.

## 7. Test plan

- Per task: `cd client && pnpm typecheck && pnpm exec vitest run <files>`.
- End: `cd client && pnpm exec vitest run` (full) plus `pnpm typecheck`. The main session runs `scripts/check-all.sh` at T0 and the end, and decides on `pnpm build`, which needs `next dev` stopped. No Docker; no server tests (no server change).
- Test conventions:
  - `renderWithProviders` with `mockFetch` for 200/404 only. 409, 422 and 429 go through a hand `vi.stubGlobal("fetch", …)` returning a `Response` with the code body `{error:{code,message}}`.
  - `fireEvent` / the `userEvent` shim only (`@testing-library/user-event` is not installed).
  - `next/navigation` uses the existing `useSyncExternalStore` mock in `SkillsView.test.tsx`.
  - Polling (2 s) uses `findBy…({timeout: 4000})` as `EvalRunControl.test.tsx:126` does, or `vi.useFakeTimers({ shouldAdvanceTime: true })` with `advanceTimersByTimeAsync`, as in `client/src/lib/hooks/eval.test.tsx`.
  - Skill fixtures: suites with `owner_kind:"skill"`, `skill_id:"s1"`, `skill_version`, host `agent_id`/`agent_version`.
  - Times under `TZ=UTC` (already pinned).

## 8. Coverage matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 | T5, T14 | `SD/helpers.test.ts`; `SkillsView.test.tsx` (`?tab=evals`) | |
| AC-2 | T1, T3, T6, T13 | `EvalCasesList.test.tsx` (skill); `SkillEvalsTab.test.tsx` | |
| AC-3 | T3, T6 | `EvalCasesList.test.tsx` (skill create and edit) | |
| AC-4 | T3, T12 | `CopyCaseDialog.test.tsx`; `client/src/lib/hooks/eval.test.tsx` | |
| AC-5 | T10, T11, T13 | `SD/helpers.test.ts`; `HostPicker.test.tsx`; `SkillEvalsTab.test.tsx` | |
| AC-6 | T6, T7, T11, T13, T14 | `EvalCasesList.test.tsx`; `EvalRunControl.test.tsx`; `SkillEvalsTab.test.tsx`; `RunOnEvalsButton.test.tsx` | |
| AC-7 | T3, T6, T13 | `EvalCasesList.test.tsx`; `client/src/lib/hooks/eval.test.tsx`; `SkillEvalsTab.test.tsx` | |
| AC-8 | T3, T7, T14 | `EvalRunControl.test.tsx`; `RunOnEvalsButton.test.tsx` | |
| AC-9 | T3, T14 | `SkillsView.test.tsx` (switch plus progress) | |
| AC-10 | T14 | `RunOnEvalsButton.test.tsx` | |
| AC-11 | T4, T6, T7, T12, T14 | `AE/helpers.test.ts`; `EvalCasesList.test.tsx`; `EvalRunControl.test.tsx`; `CopyCaseDialog.test.tsx`; `RunOnEvalsButton.test.tsx` | |
| AC-12 | T3, T4, T8 | `EvalRunHistory.test.tsx`; `RegressionBanner.test.tsx`; banner helpers test; `client/src/lib/hooks/eval.test.tsx` (invalidation) | |
| AC-13 | T9 | `EvalCompare.test.tsx` | |
| AC-14 | T1, T15 | existing agent, dashboard and per-agent suites unedited; `EvalsTab.test.tsx` no-`/skills/` test | |
| NFR-1 | T11, T13, T14, T16 | role/name queries; manual keyboard | |
| NFR-2 | T2, T16 | key use in tests; manual 80-char names | |
| NFR-3 | T3, T12, T13 | `SkillEvalsTab.test.tsx` request set; `CopyCaseDialog.test.tsx` (no fetch before open) | |
| NFR-4 | T7, T13 | no POST before confirm | |

## 9. Risks and known traps

- **R1 Tab parser** (INSIGHTS 2026-10-07): `parseSkillTab` is derived from `SKILL_TABS`, so adding the key is enough. The existing test at `SD/helpers.test.ts:12` asserts the opposite and must be rewritten, not deleted. Test every key.
- **R2 Vendored `Tabs` and `Modal` lack a11y.** The tabs are plain buttons (query them as `button`). The `Modal` needs `useDialogA11y` plus a portal for the copy dialog (same as `EvalCaseModal`). `SelectInput` has no label support, so use a native `<select>` (INSIGHTS 2026-09-19). Never edit `client/src/vendor/**`.
- **R3 Stale skill history** (D3): without the owner-aware invalidation in `useEvalRun`, a finished skill suite never refreshes the history or the header's running state.
- **R4 AC-14 by construction:** agent hooks, keys, request bodies and props are unchanged; skill behaviour is additive. Any edit to an existing assertion in the agent, dashboard or per-agent suites is a plan violation.
- **R5 Host state per skill:** `SkillDetail` is not keyed by skill id (`SkillsView.tsx:92`). Store the choice with its `skillId`, or a choice made for skill A leaks to skill B.
- **R6 Extra reads on every tab:** the header reads cases, suites, agents and stats on all skill tabs. Same keys, so the Evals tab adds nothing; `SkillStatsTab` shares `["skill-stats", id]`. Existing `SkillsView` and `SkillDetail` tests get 404s for unrouted reads. That is harmless (no global error toast in `renderWithProviders`), but add routes where a test counts calls.
- **R7 `mockFetch`** answers only 200 or 404; 409, 422 and 429 need a hand stub (INSIGHTS 2026-10-06). `ErrorState` Retry is queried by the name "Retry".
- **R8 Value imports** from `@devdigest/shared` are fine now (`next.config.mjs` alias), but stay with `import type`. `pnpm build` is the only check for webpack-only resolution.
- **R9 jsdom:** no `scrollIntoView` (call it with `?.()`). `var()` shorthands are dropped, so assert longhands. Active-row border must use the shorthand (INSIGHTS 2026-10-07).
- **R10 Long names** (EC-7, INSIGHTS 2026-09-26): title column `flex 1 1 0; minWidth 0; nowrap; ellipsis`; controls `flexShrink: 0`; `title` tooltips.
- **R11** `pnpm build` while `next dev` runs corrupts `.next` (INSIGHTS 2026-10-01). Only the main session decides to build.
- **R12 Paid calls:** none in tests (fetch is mocked). A manual demonstration run must be announced to the user first and use a non-reasoning host model (G1 NFR-1, server INSIGHTS 2026-10-16).
- **R13 TZ:** history timestamps go through `RanAt`/`formatRanAtLocal` under the pinned `TZ=UTC`.
- **R14 Recharts:** not used by this spec. If a test renders `SkillStatsTab`, keep it mocked as `SkillsView.test.tsx:9` does.

## 10. Handoff

**Do not touch:** `client/src/vendor/**` (including `ui/kit/Tabs.tsx`, `Modal`, `shared/**`); `server/**`, `reviewer-core/**`, `e2e/**`, `devdigest-mcp/**`, `evals/**`; migrations; `pnpm-lock.yaml`, `package-lock.json`, `client/package.json` deps; `server/clones/**`; `client/src/app/eval/**` and `client/src/components/finding-card/**` (no behaviour change); existing agent hook signatures, keys and bodies; pre-existing assertions of agent, dashboard and per-agent tests; spec bodies (A–G).

**For `architecture-reviewer`:**
- `AE/` parts take an owner prop and contain no skill-route imports.
- The skills route imports only `AE/`, `client/src/lib/**` and its own `_components`.
- No `fetch` in components; no new barrel; `lib/` imports nothing upward.
- `RunOnEvalsButton` and `SkillEvalsTab` share one `useSkillEvalHost` instance from `SkillDetail`.

**Security:** no review needed. The client sends ids only; workspace checks are server-side (G1 NFR-3). Rendered text is escaped.
