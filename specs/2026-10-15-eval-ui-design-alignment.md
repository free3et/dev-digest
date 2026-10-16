# Spec: Eval UI labels and layout aligned with the design mockups | Spec ID: SPEC-2026-10-15-eval-ui-design-alignment | Status: approved
Supersedes: presentation-only parts of [SPEC-2026-10-12-eval-run-history-compare](2026-10-12-eval-run-history-compare.md) (Spec B: AC-4 caption and pass format, AC-10 dashboard table layout) and [SPEC-2026-10-13-eval-dashboard-compare-polish](2026-10-13-eval-dashboard-compare-polish.md) (Spec D: AC-5 subtitle, AC-17 recent table layout, AC-21 metric cell layout). See "Amendments to Spec B and Spec D". Behaviour, data and contracts of both stay as they are.
Depends on: Spec B, Spec D (both approved); [SPEC-2026-10-12-eval-cases-and-scoring](2026-10-12-eval-cases-and-scoring.md) (Spec A: case kinds); [SPEC-2026-10-13-eval-case-modal](2026-10-13-eval-case-modal.md) (Spec C: the POSITIVE / NEGATIVE CASE wording).
Modules: client
Approved: free3et (user), 2026-10-16

> Spec E of the Eval Pipeline (index: `specs/eval-pipeline.md`). This is the DevDigest **review agent** eval. It is unrelated to the root `evals/` package. It lives in the top-level `specs/` with Specs A–D at the user's request, although it touches only `client` (C-1).

## Problem and user

The user compared the implemented Eval UI with the instructor's design reference (D-1) on 2026-10-15 and found that it "differs a lot" and that the labels are not like the design (D-2). Concretely:

- The Eval Dashboard is a plain table (Agent / Cases / Recall / Precision / Citation / Latest run / "Open Evals tab"). The design shows one row-card per agent with big coloured metric numbers.
- The subtitle reads "Regressions first, then by agent name" instead of the design's "Regression harness across all reviewer agents · pick an agent to see its runs".
- Agent names are cut early ("General R…"). The cause is the fixed, equal-width table layout: the agent column gets about one seventh of the width (D-3).
- `drop` and `running` are bare coloured words, not labelled pills (D-3).
- Times read "2026-10-15 20:38 UTC". The design shows a plain local "2026-05-29 09:14" (D-1, D-3).
- "Recent eval runs" has a visible header row. The design shows a card-table without one.
- In the agent's Evals tab, case rows show a grey "must find" / "must not flag" badge next to a long, truncated name (D-2, D-3). The case modal of Spec C already says "POSITIVE CASE" / "NEGATIVE CASE".

The user is the person tuning a review agent's prompt. They want the screens they already have to look and read like the design. They do **not** want new data, new requests or new behaviour (C-2). Mock values in the design (`gpt-4.1`, `17/20`, "20-trace gold set") are illustrative only (C-3).

## Goals / Non-goals

- **G-1** The Eval Dashboard agent list becomes a list of row-cards:
  - a decorative icon, the agent name and labelled pills;
  - a "Last run" line;
  - three big captioned metrics (RECALL / PREC / CITE in blue / green / orange);
  - a chevron link to the agent's Evals tab;
  - the design's title, subtitle and "AGENTS" section label.
- **G-2** "Recent eval runs · all agents" becomes a card-table with no visible header row: bold agent name, monospace time, accent-coloured version, a coloured mini bar plus percent per metric, bold "n/m".
- **G-3** One label vocabulary close to the design:
  - case kinds as POSITIVE / NEGATIVE badges, with "must find" / "must not flag" kept in the accessible name;
  - small uppercase captions;
  - "RECENT RUNS · N selected";
  - the design's compare subtitle, made truthful with the real case count.
- **G-4** Readable agent and case names: truncation only when the text really does not fit.
- **G-5** One local, readable timestamp format on every eval screen, with the exact UTC time kept in a tooltip.
- **G-6** No new request, no contract change, no server change, no model call (C-2).

- **NG-1** **Model chip** next to the agent name (design: `gpt-4.1`). `EvalDashboardRow` has no model field (D-4). The only client-side source would be an extra `GET /agents`, which is a new request (G-6). Out of scope. *Possible follow-up:* (a) add an `agent_model` field to `EvalDashboardRow` and `EvalRecentRun` in `@devdigest/shared` and the server join (contract change), or (b) read the already cached agents list where one exists. See OQ-1.
- **NG-2** **Sparklines** in the agent cards. They need a per-agent series the dashboard does not fetch (Spec D NG-1). *Possible follow-up.*
- **NG-3** **METRIC TREND** line chart. No such element exists, so its caption is not added either (Spec B NG-1, Spec D NG-1). *Possible follow-up.*
- **NG-4** **Per-agent dashboard sub-page**: the "All agents" back link, the page title with model chip, "Regression harness · N runs on the … set" and the three metric cards. The Evals tab stays the per-agent view (Spec D NG-3). *Possible follow-up.*
- **NG-5** **"Run all agents"** button. A bulk start multiplies model spend with one click (Spec D NG-2). *Possible follow-up* with its own cost confirmation.
- **NG-6** **"Promote vN"** in the compare footer. It changes the production agent config (Spec D NG-5). *Possible follow-up* as its own spec.
- **NG-7** **Agent / date selectors and "30 days"** on the dashboard (Spec D NG-4). *Possible follow-up.*
- **NG-8** A generated banner phrase such as "a new false positive slipped in". It needs per-case analysis (Spec D NG-6). The banner text stays as Spec D AC-13…AC-15 define it. Only its look changes (AC-18).
- **NG-9** Any change to how `running` / `drop` are computed or refreshed: no dashboard polling (Spec B EC-6) and no server reaper change. EC-9 records what was found; it is not a requirement.
- **NG-10** Per-agent icons or avatars. No icon data exists. Every card uses the same decorative icon.
- **NG-11** The FindingCard "Turn into eval case" button labels ("must find" / "must not flag", Spec A AC-5) and the Spec C modal banner wording. Both are unchanged.
- **NG-12** Editing the vendored `@devdigest/ui` primitives. Existing ones (`Badge`, `Button`, icons) are reused as they are.
- **NG-13** Translations other than `en`. Only `messages/en/eval.json` exists for this namespace (D-3).

## Amendments to Spec B and Spec D

Spec B and Spec D stay `approved`, and their bodies are not edited (same rule as Spec D C-8). Where they disagree with this spec, this spec wins for the items below **in presentation only**. Data, ordering, selection rules, requests and contracts stay as they define them.

| Item | Change |
|---|---|
| Spec B AC-10 (dashboard: a table with one row per agent and a case count column) | **Superseded in layout.** It becomes a list of row-cards (AC-2…AC-9). Row set, order (drops first, then by name), the `drop` / `running` meaning and the link target are unchanged. The case count is shown only for agents that have never run (AC-6). For agents with a run, the card shows the run's own passed / total (AC-5). |
| Spec B AC-4 (history columns) | **Amended in captions only.** Captions are styled small uppercase (AC-13). "Passed" becomes "Pass", and the passed / total text becomes "n/m" without spaces (AC-17). The columns, their order (Status stays), the 50-row cap, "—" for null and the selection rules are unchanged. |
| Spec B EC-11 (long names truncate) | **Refined** by AC-9 and AC-15: truncation only when the text does not fit the space the layout gives it. |
| Spec B / Spec D timestamp `ran_at` "YYYY-MM-DD HH:mm UTC" | **Superseded** by local time with a UTC tooltip (AC-12). |
| Spec D AC-5 (compare subtitle "Old prompt vs new — metric deltas and prompt diff") | **Extended** with the case set: "… on the N-case set", or "… on different case sets" (AC-19). The title is unchanged. |
| Spec D AC-17 (recent table: visible header row, "7 / 8", plain "partial" text) | **Superseded in layout.** The header row is visually hidden but kept for assistive tech, with coloured mini bars, "7/8" in bold and "partial" as a pill (AC-11). Rows, order, the link, the percent format and the null rules are unchanged. |
| Spec D AC-21 (dashboard metric cell "82% (▲ 4 pt)") | **Superseded in layout.** It becomes a big "82%" with the point delta "▲ 4 pt" on a small line below it, without parentheses (AC-7, OQ-2). The values and the delta rules (Spec D "Formats", EC-19, EC-20) are unchanged. |
| Spec D AC-13…AC-16 (regression banner) | **Unchanged in text and rules.** Only its look changes (AC-18). |
| Spec D AC-18, AC-19, Spec B AC-12 (empty / error states) | **Unchanged** (AC-20). |
| Spec D NFR-1 (text, never colour alone; decorative bars) | **Kept and extended** by NFR-1 here. |
| Spec A AC-7 (case "expectation kind as a text badge") | **Amended in wording.** The badge text is "Positive" / "Negative", and the accessible name keeps "must find" / "must not flag" (AC-14). |

## User stories

- **US-1** As a user opening `/eval`, I recognise the design: one card per agent, with its name in full, when it last ran and how many cases passed, and three big coloured numbers. A chevron takes me to that agent.
- **US-2** As a user, I scan "Recent eval runs" like the design's card-table and read times in my own time zone.
- **US-3** As a user in an agent's Evals tab, I can tell positive from negative cases at a glance and read the case name, and the run list reads "RECENT RUNS · 2 selected" with Compare next to it.

## Design references

- **D-1** text from user: **"D-mockups-2026-10-15"**, the instructor's design reference as described by the user, relayed by the main session, seen 2026-10-15.
  - (1) *Eval Dashboard*: title "Eval Dashboard"; subtitle "Regression harness across all reviewer agents · pick an agent to see its runs"; a small uppercase section label "AGENTS" with an icon.
    - Each agent is a row-card: a round-square icon; the bold name plus a monospace model chip; a second line "Last run v7 · 2026-05-29 09:14 · 17/20 pass"; at the right a sparkline, then three big coloured numbers with tiny uppercase captions RECALL (blue), PREC (green), CITE (orange), e.g. "82%"; then a chevron.
    - Top right: a primary "Run all agents" button.
    - A section label "RECENT EVAL RUNS · ALL AGENTS" with a clock icon, over a card-table **without** a header row: bold agent name · monospace timestamp · blue "v7" · three mini progress bars (blue / green / orange), each followed by its percent · bold "17/20".
  - (2) *Per-agent page*:
    - a back link "All agents", the title plus model chip, the subtitle "Regression harness · 5 runs on the 20-trace gold set";
    - an amber banner "Precision dipped 2pts on v7 — a new false positive slipped in. Recall and citation both up.";
    - three metric cards (RECALL / PRECISION / CITATION ACCURACY, "82%" plus a coloured "↑ 0.04"), then "METRIC TREND";
    - "RECENT RUNS · 2 selected" with a "Compare" button, and table columns RAN AT / VERSION / RECALL / PRECISION / CITATION / PASS / COST with checkboxes.
  - (3) *Compare modal*:
    - title "Compare runs · v6 → v7", subtitle "Old prompt vs new — metric deltas and prompt diff on the 20-trace gold set";
    - four tiles RECALL / PRECISION / CITATION / COST "78% → 82% ▲ 4pt", then "SYSTEM PROMPT DIFF" with the legend "v6 (old)" / "v7 (new)";
    - a footer with Close and "Promote v7".
  - Mock values are illustrative (C-3).
- **D-2** text from user: the user's description of the **current** screens and feedback, 2026-10-15:
  - the dashboard is a plain table with the columns above and the subtitle "Regressions first, then by agent name";
  - names are truncated to "General R…";
  - "drop" / "running" appear as bare words;
  - times are "2026-10-15 20:38 UTC";
  - the recent table has a header row;
  - case rows show a grey "must find" / "must not flag" badge next to a long truncated `path:line title` name.
- **D-3** code, current UI, seen 2026-10-15:
  - Dashboard: a table with 7 columns and `tableLayout: "fixed"` (equal column widths, so the agent column is narrow) (`client/src/app/eval/_components/EvalDashboard/EvalDashboard.tsx:18,51-95`, `styles.ts:8,20-27`). Flags are coloured bold text (`styles.ts:28-30`, `EvalDashboard.tsx:74-75`). The subtitle key is `dashboard.driftTitle` (`client/messages/en/eval.json:47`). The metric cell is `dashboard.metricWithDelta` (`:40`).
  - Recent runs: a table with a visible `thead` (`…/EvalDashboard/RecentRuns/RecentRuns.tsx:62-71`) and a decorative bar (`:26-40`); passed / total is `history.passedOfTotal` "{passed} / {total}" (`eval.json:225`).
  - Timestamps: `formatRanAt` gives "YYYY-MM-DD HH:mm UTC" (`client/src/lib/format.ts:81-86`). It is used by the dashboard, recent runs, history and compare run info only (`EvalDashboard.tsx:82`, `RecentRuns.tsx:80`, `EvalRunHistory.tsx:73`, `CompareRunInfo.tsx:33-34`); there is no other caller in `client/src`.
  - Case list: the `Badge` uses the default grey with `evalsTab.kind.*` "must find" / "must not flag" (`…/EvalsTab/EvalCasesList/EvalCasesList.tsx:59`, `eval.json:165-168`). Name and location share one flex row; location takes up to 40 % (`EvalCasesList/styles.ts:26-45`).
  - History: heading "Run history" (`EvalRunHistory.tsx:107-109`, `eval.json:217`); columns select…cost with "Passed" (`EvalRunHistory.tsx:14`, `eval.json:230-240`).
  - Banner: `<p role="note">` with a red (`--crit`) border (`RegressionBanner.tsx:42-46`, `RegressionBanner/styles.ts:4-13`).
  - Compare: subtitle key `compare.subtitle` (`eval.json:306`); tile captions are 11.5 px, not uppercase (`CompareTiles/styles.ts:15`).
  - `@devdigest/ui` `Badge` accepts `color`, `bg`, `icon`, `mono` (`client/src/vendor/ui/primitives/Badge.tsx:5-11`).
  - Agent model exists only on `Agent` via `GET /agents` (`client/src/lib/hooks/agents.ts:8-13`).
- **D-4** contracts: `EvalDashboardRow` has `agent_id`, `agent_name`, `cases_total`, `latest` (`EvalSuiteRun`, nullable), `running`, `delta`, `drop`, and **no model** (`server/src/vendor/shared/contracts/eval-ci.ts:172-189`). `EvalRecentRun` = `EvalSuiteRun` + `agent_name` (`:202`). `EvalSuiteRun.case_ids` is the frozen case set (`:107`). Read 2026-10-15.
- **D-5** specs: Spec B (AC-4, AC-10, AC-12, EC-6, EC-11), Spec D (AC-5, AC-13…AC-21, NFR-1, NFR-6, NG-1…NG-6, "Formats"), Spec A AC-5 / AC-7 and Spec C (banner wording), all approved; `client/docs/eval-ui.md` (surfaces, hooks and endpoints, metric formats). Read 2026-10-15.
- **D-6** code (server, for the EC-9 observation only):
  - The boot reaper turns every `running` suite into `failed` / "interrupted" before the server listens (`server/src/app.ts:95-102`, `server/src/modules/eval/service.ts:362-404`, `server/docs/eval.md:275-278`). It assumes a single API instance (`app.ts:86-87`).
  - Each case's model call is bounded by `EVAL_CASE_TIMEOUT_MS` (`server/src/modules/eval/suite-executor.ts:70`).
  - If even the failure write fails while the process lives, the suite stays `running` until the next boot (`suite-executor.ts:106-112`, comment "The boot reaper cleans up").
  - Client: the dashboard does not poll; `["eval-dashboard"]` is invalidated only by a start or by an Evals-tab poll that sees a run leave `running` (`client/docs/eval-ui.md`, hooks table).
- **D-7** curated: client `INSIGHTS.md`:
  - 2026-09-26: long text in a flex row needs nowrap + ellipsis on both siblings;
  - 2026-10-01: ICU plurals need `t(key, { count })`;
  - 2026-09-18: grep every call site before rewording a key;
  - 2026-10-06: `ErrorState` hardcodes "Retry".

## Workflow and communication

n/a — no new flow and no new request. The requests are exactly those of Spec D's diagram: `GET /eval/dashboard` and `GET /eval/recent-runs?limit=10` on `/eval`, and the unchanged Evals tab and compare reads (NFR-2).

## Contracts

| Contract | Change | Shape |
|---|---|---|
| `GET /eval/dashboard` → `EvalDashboardRow[]` | unchanged | Its fields feed the cards (AC-3…AC-8). It has no model field (NG-1). |
| `GET /eval/recent-runs` → `EvalRecentRun[]` | unchanged | Feeds AC-11. |
| `GET /agents/:id/eval-cases` → `EvalCase[]` | unchanged | `expected_output.kind` feeds AC-14. |
| `GET /agents/:id/eval-runs` → `EvalSuiteRun[]` | unchanged | Feeds AC-16, AC-17 and the banner. |
| `GET /eval-runs/:id` → `EvalSuiteRunDetail` | unchanged | `case_ids` feeds AC-19. |
| DB, server, `@devdigest/shared` | unchanged | No table, column, route or schema change (G-6). |

## Acceptance criteria (EARS)

Terms:

- "Card" = one agent entry of the dashboard agent list.
- "Percent format" and "point-delta format" are Spec D's "Formats", unchanged.
- "Local time" = the `ran_at` instant in the browser's time zone, written `YYYY-MM-DD HH:mm` (24-hour, zero-padded, no zone suffix).
- "Small uppercase caption" = text rendered in capitals by styling, at most 11.5 px, letter-spaced, in the muted text colour. The DOM text and the i18n value stay in sentence case, so screen readers read words, not letters (C-6).
- Colours: recall = blue, precision = green, citation = orange. Each is a fixed identity colour per metric, applied consistently on every eval screen. It never carries meaning alone; a caption or column header always names the metric.

**Eval Dashboard — page and agent cards**

- **AC-1** — WHEN the user opens `/eval`, the Eval Dashboard SHALL show the heading "Eval Dashboard" and, directly below it, the subtitle "Regression harness across all reviewer agents · pick an agent to see its runs". The old subtitle "Regressions first, then by agent name" no longer appears anywhere.
  - Source: G-1, D-1 (1), D-2, C-4
  - Verify: component (RTL): `getByRole("heading", { level: 1, name: "Eval Dashboard" })`; the subtitle text present; `queryByText("Regressions first, then by agent name")` is null

- **AC-2** — WHEN `GET /eval/dashboard` returns at least one row, the dashboard SHALL render, under a level-2 heading "Agents" shown as a small uppercase caption with a decorative icon, a list (`role="list"`, accessible name "Agents") with one card (`listitem`) per row in the server's order and no column header row.
  - Source: G-1, US-1, D-1 (1), Spec B AC-10 (order unchanged), C-5
  - Verify: component (RTL): `getByRole("list", { name: "Agents" })` holds as many `listitem`s as rows, in response order (drops first); `queryAllByRole("columnheader")` within the section is empty; the icon has `aria-hidden="true"`

- **AC-3** — WHEN a card renders, its first line SHALL show a decorative agent icon, then the agent name in bold as plain text with the full name as its tooltip (`title`).
  - Source: G-1, G-4, US-1, D-1 (1), NG-1, NG-10
  - Verify: component (RTL): the name text and `title` equal `agent_name`; an agent named `<script>alert(1)</script>` renders literally; the icon has `aria-hidden="true"`; no model chip is rendered

- **AC-4** — WHILE a row has `drop` true, `running` true, or `latest.status` `partial`, its card SHALL show, after the name, one pill per state with the visible text "drop", "running" or "partial" and the tooltip:
  - "drop" → "Recall or precision fell against the previous finished run";
  - "running" → "An eval run was in progress when this page loaded";
  - "partial" → "The latest run finished with errored cases".

  Each pill has a border and a tinted background. The text, not the colour, names the state.
  - Source: G-1, D-2 ("bare words"), D-3, D-4, C-7, EC-9
  - Verify: component (RTL): `getByText("drop")` and `getByText("running")` inside the card, each with its `title`; "partial" only for a `partial` latest run; no pill when all three are false

- **AC-5** — WHEN a row has a `latest` run, the card's second line SHALL read "Last run v<agent_version> · <local time of ran_at> · <cases_passed>/<cases_total> pass", from `latest`.
  - Source: G-1, G-5, US-1, D-1 (1), C-8
  - Verify: component (RTL), with the time zone pinned: `latest` v7, `ran_at` 2026-05-29T09:14Z under `TZ=UTC` → "Last run v7 · 2026-05-29 09:14 · 17/20 pass"; no "UTC" in the visible text

- **AC-6** — IF a row has no `latest` run, THEN the card's second line SHALL read "Never run · <cases_total> case(s)" (ICU plural), and its three metrics SHALL show "—" with no delta.
  - Source: G-1, Spec B EC-7, Spec B AC-10 (case count kept here), C-8
  - Verify: component (RTL): `latest: null`, `cases_total: 1` → "Never run · 1 case"; 5 → "Never run · 5 cases"; three "—" and no `role="img"` delta in the card

- **AC-7** — WHEN a card renders, it SHALL show at its right three metric blocks in the order recall, precision, citation accuracy. Each block has:
  - a small uppercase caption "Recall" / "Prec" / "Cite", whose tooltip and accessible name are the full metric name ("Recall", "Precision", "Citation accuracy");
  - the latest value in the percent format as a large number (≥ 20 px, bold) in the metric's colour;
  - the point delta from `row.delta` on a small line below it ("▲ 4 pt", or "—" for a null delta, with Spec D's accessible names "up 4 pt" / "down 2 pt" / "unchanged").

  A null value shows "—" with no delta.
  - Source: G-1, US-1, D-1 (1), Spec D AC-21 (superseded in layout), OQ-2 (default applied), EC-2, EC-3
  - Verify: component (RTL): 0.82 with delta +0.04 → "82%" and `getByRole("img", { name: "up 4 pt" })`; null delta → "—" on the delta line; null value → "—", no delta; `getByTitle("Precision")` on the "Prec" caption; no "(" or ")" in the metric text

- **AC-8** — WHEN a card renders, its right end SHALL hold exactly one link: a chevron icon to `/agents/<agent_id>?tab=evals` with the accessible name "Open Evals tab of <agent_name>" and a visible focus ring. The visible text "Open Evals tab" no longer appears.
  - Source: G-1, US-1, D-1 (1), Spec B AC-10 (link target unchanged)
  - Verify: component (RTL): `within(card).getAllByRole("link")` has length 1; name "Open Evals tab of Zed"; `href` "/agents/z1?tab=evals"; `queryByText("Open Evals tab")` is null; focus ring: manual (jsdom has no `:focus-visible` styling)

- **AC-9** — WHILE the viewport is at least 1280 px wide, the card SHALL give the agent name all width of its first line not taken by the icon and the pills, so that a name of up to 40 characters shows in full. A longer name ends in an ellipsis on one line and keeps its full text in the tooltip.
  - Source: G-4, D-2 ("General R…"), D-3 (fixed equal columns), D-7 (2026-09-26), Spec B EC-11 (refined), EC-1
  - Verify: component (RTL): the name element has `white-space: nowrap`, `text-overflow: ellipsis` and a flexible width (`flex-grow` ≥ 1, `min-width: 0`), and `title` = the full name; manual: at 1280 px a 40-character name with "drop" and "running" pills shows untruncated, and a 120-character name ellipsizes without wrapping or pushing the metrics off the card

**Eval Dashboard — recent runs**

- **AC-10** — WHEN the recent-runs section renders, its level-2 heading SHALL read "Recent eval runs · all agents", shown as a small uppercase caption preceded by a decorative clock icon. The section's accessible name is that text.
  - Source: G-2, D-1 (1), Spec D AC-17 (title unchanged), C-6
  - Verify: component (RTL): `getByRole("region", { name: "Recent eval runs · all agents" })`; heading style `text-transform: uppercase`; the clock icon has `aria-hidden="true"`

- **AC-11** — WHEN `GET /eval/recent-runs` returns items, each row of the recent table SHALL show, in order:
  - the agent name in bold as a link to `/agents/<agent_id>?tab=evals`, with the full name as its tooltip;
  - the local time of `ran_at` in monospace;
  - "v<agent_version>" in the accent colour, as plain text, not a link and not underlined;
  - for recall, precision and citation accuracy, a mini bar in the metric's colour followed by the percent ("—" and no bar for null);
  - "<cases_passed>/<cases_total>" in bold;
  - a "partial" pill for a `partial` run.

  The table keeps its column headers for assistive tech ("Agent", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass"), but they are visually hidden, so no header row is visible.
  - Source: G-2, US-2, D-1 (1), D-2, Spec D AC-17 (superseded in layout), C-9, EC-2
  - Verify: component (RTL): rows in response order; link name and `href`; "7/8" in a bold element; "partial" pill; 0.75 → "75%" with an `aria-hidden` bar; null → "—" and no bar; `getAllByRole("columnheader")` has the seven names, and their row is visually hidden (clip / 1 px pattern); the version element is not a link

**All eval screens**

- **AC-12** — The eval screens SHALL show every suite-run timestamp in local time, with the exact UTC instant ("YYYY-MM-DD HH:mm UTC") as its tooltip. This covers the dashboard cards, the recent runs, the run history (including the checkbox name "Select run from <local time>") and the compare run details. An unparsable value is shown as is.
  - Source: G-5, US-2, D-1 (1), D-2, D-3, C-10, EC-6
  - Verify: unit: the timestamp helper with `TZ=Europe/Kyiv`, `2026-10-15T20:38:00Z` → "2026-10-15 23:38", tooltip "2026-10-15 20:38 UTC"; with `TZ=UTC` → "2026-10-15 20:38"; `"not a date"` → unchanged; component (RTL): history checkbox name uses the local form; no visible "UTC" on any eval screen

- **AC-13** — The eval screens SHALL render as small uppercase captions:
  - the dashboard section headings "Agents" and "Recent eval runs · all agents";
  - the card metric captions;
  - the run-history column headers;
  - the compare tile captions "Recall", "Precision", "Citation" and "Cost";
  - the compare "System prompt diff" heading.

  Their i18n values stay in sentence case.
  - Source: G-3, D-1 (1)(2)(3), C-6
  - Verify: component (RTL): each element's inline style has `textTransform: "uppercase"`; the DOM text is the sentence-case value (e.g. `getByText("Ran at")`); i18n assertion: `eval.json` values for these keys contain lowercase letters

**Evals tab**

- **AC-14** — WHEN the case list renders a case, its kind badge SHALL read "Positive" for `must_find` or "Negative" for `must_not_flag` (small uppercase). It has the accessible name and tooltip "Positive case · must find" / "Negative case · must not flag", and a green (positive) or amber (negative) tint.
  - Source: G-3, US-3, D-1 (Spec C wording), D-2, D-3, Spec A AC-7 (amended in wording), C-11
  - Verify: component (RTL): `getByLabelText("Positive case · must find")` and `getByTitle("Negative case · must not flag")`; visible texts "Positive" / "Negative"; `queryByText("must find")` finds no visible badge text; i18n assertion: `evalsTab.kind.*` keys and their `*Name` siblings exist

- **AC-15** — WHEN the case list renders a case, the row SHALL show on its first line:
  - the badge;
  - the case name, using all remaining width before the Delete button, on one line with an ellipsis only when it does not fit, and the full name as its tooltip.

  The `file:line` location goes on a second line, in monospace and the muted colour, also with an ellipsis and its full text as a tooltip.
  - Source: G-4, US-3, D-2 ("long truncated name"), D-3 (name and location share one row), D-7 (2026-09-26), EC-1, EC-4
  - Verify: component (RTL): name and location are in different line containers; both have `title`; the name has a flexible width and ellipsis style; manual: at 1280 px a 70-character name shows in full

- **AC-16** — WHEN the run history renders, its heading SHALL read "Recent runs" while no finished run is selected, and "Recent runs · <n> selected" while n ≥ 1 runs are selected (n = the effective selection, Spec B AC-5). The Compare button sits at the right end of the heading row, and the section's accessible name is "Recent runs".
  - Source: G-3, US-3, D-1 (2), Spec B AC-4 / AC-5 (rules unchanged), C-12, EC-5
  - Verify: component (RTL): `getByRole("region", { name: "Recent runs" })`; ticking two rows → heading text "Recent runs · 2 selected"; one row → "· 1 selected"; none → "Recent runs"; Compare still enabled only with exactly two; `queryByRole("heading", { name: "Run history" })` is null

- **AC-17** — WHEN the run history renders its table, the column headers SHALL be, in order: "Select" (visually hidden), "Ran at", "Version", "Status", "Recall", "Precision", "Citation", "Pass", "Cost". The version cell is accent-coloured plain text "v<n>", and the pass cell reads "<passed>/<total>" ("—" while `running`).
  - Source: G-3, D-1 (2), Spec B AC-4 (amended in captions), C-9, C-13
  - Verify: component (RTL): `getAllByRole("columnheader")` names in that order; "7/8" in a pass cell; a `running` row shows "—"; no "Passed" header

- **AC-18** — WHILE the regression banner is shown (Spec D AC-13…AC-16 unchanged), it SHALL render as an amber callout (amber border and tint) with a decorative warning icon before its text. The text, `role="note"` and the accessible name "Regression" stay unchanged.
  - Source: G-3, D-1 (2) ("amber banner"), D-3, NG-8
  - Verify: component (RTL): `getByRole("note", { name: "Regression" })` text is identical to Spec D's sentences; the icon has `aria-hidden="true"`; the style uses the warning token, not `--crit`

**Compare dialog**

- **AC-19** — WHEN both compared runs have loaded, the dialog subtitle SHALL read:
  - "Old prompt vs new — metric deltas and prompt diff on the <N>-case set", where N is the number of `case_ids` of the two runs, when both runs have the same case set;
  - "Old prompt vs new — metric deltas and prompt diff on different case sets" otherwise.

  The title (Spec D AC-5) is unchanged.
  - Source: G-3, D-1 (3), Spec D AC-5 (extended), C-3, C-14, EC-7
  - Verify: component (RTL): two runs with the same 8 ids → "… on the 8-case set"; 1 id → "… on the 1-case set"; different sets → "… on different case sets"; no "20-trace" or "gold set" text

**Unchanged states (regression guard)**

- **AC-20** — IF the agent list or the recent-runs section is loading, has failed or is empty, THEN the dashboard SHALL show the same loading texts, `ErrorState` with "Retry" and empty texts as Spec B AC-12 and Spec D AC-18 / AC-19 define, for each section independently.
  - Source: Spec B AC-12, Spec D AC-18, AC-19, EC-8
  - Verify: component (RTL): the existing state tests of both sections keep passing unchanged (loading text, "Retry" re-sends only its own GET, the "Go to agents" link, "No finished eval runs yet.")

## Edge cases

- **EC-1** Long names. An agent name of 120 characters, a case name built from a long `path:line title`, or a long translation ellipsizes on one line, keeps a tooltip and never pushes the metrics or the Delete button out of the row → AC-9, AC-15.
- **EC-2** Null metrics. A null value shows "—" with no delta (card) or no bar (recent). A null delta shows "—" on the card's delta line → AC-7, AC-11.
- **EC-3** Partial data. A `partial` latest run shows its stored metrics and a "partial" pill. Its n/m is the run's own passed / total → AC-4, AC-5, AC-7.
- **EC-4** No runs at all. Cards read "Never run · N cases" with "—" metrics (AC-6), and the recent section shows its empty text (AC-20). In the Evals tab, the heading is "Recent runs" over the existing empty text (AC-16).
- **EC-5** Selection with running / failed rows. They cannot be selected (Spec B AC-5), so they never count in "N selected" → AC-16.
- **EC-6** Time zone. The timestamp is computed in the browser. Eval data is fetched on the client only, so server and client rendering never disagree on the text. A timestamp near midnight may show a different date than its UTC form, and the tooltip shows the UTC one → AC-12.
- **EC-7** Different case sets in compare → the subtitle says "different case sets", and the existing notice stays (Spec D AC-8) → AC-19.
- **EC-8** One section fails or is empty while the other has data → each keeps its own state → AC-20.
- **EC-9** (observation, not a requirement; NG-9) **Can "running" get stuck?** The dashboard's `running` is "a suite of this agent is `running` now", read once on page load (D-4, D-6).
  - **Process dies.** The boot reaper turns every `running` suite into `failed` / "interrupted" before the server listens again, so a dead process does not leave the label stuck past a restart (D-6).
  - **Hung model call.** Each case's call is time-bounded (D-6).
  - **It can stay stuck in two cases:**
    - (a) while the same process keeps running, if writing the final or failure status itself fails (DB failing). The row then stays `running`, and the agent cannot start a new run, until the next server restart.
    - (b) With more than one API instance per DB (unsupported, D-6).
  - **Stale but correct:** because the dashboard does not poll, a run that finished after page load still shows "running" until the page is revisited or an Evals-tab poll invalidates the dashboard (D-6). AC-4's tooltip says "when this page loaded" for that reason.
  - Possible follow-up for the user: a "running for more than X min" hint, or a reaper on a timer instead of only on boot.
- **EC-10** RTL / layout direction. The app has no right-to-left locale and no new locale is added (NG-13). The layout must not depend on reading direction to carry meaning, because every metric is named by text → AC-7, AC-11, NFR-1.
- **EC-11** Many agents or runs. The dashboard lists every agent with cases (Spec B AC-10) and at most 10 recent runs (Spec D AC-1). Volumes are unchanged, and there is no paging or virtualisation → AC-2, AC-11.
- **EC-12** Agent names containing markup. They render literally as text → AC-3, AC-11, NFR-3.

## Non-functional requirements

| ID | Category | Requirement (measurable) | Verify |
|---|---|---|---|
| NFR-1 | accessibility (WCAG 2.2 AA) | **No information by colour alone (1.4.1):** every coloured element (metric numbers, bars, pills, kind badges, banner, version text) has a text equivalent: a caption, column header, pill text, badge text or the banner sentences. **Contrast (1.4.3 / 1.4.11):** text ≥ 4.5:1, metric numbers ≥ 20 px bold ≥ 3:1, pill and badge borders ≥ 3:1 against the card background. **Decorative:** icons and bars are `aria-hidden`. **Names:** the chevron link "Open Evals tab of <name>", the kind badges "Positive case · must find" / "Negative case · must not flag", abbreviated captions with the full metric name. Hidden table headers stay in the accessibility tree. **Keyboard:** one tab stop per card (the chevron link), with visible focus (2.4.7). Uppercase is styling only (C-6). | component (RTL): role / name / title queries in AC-2…AC-19; `aria-hidden` on icons and bars; manual: contrast check of the three metric colours and the amber callout in the app theme with a contrast checker; keyboard pass over `/eval` |
| NFR-2 | performance / requests | No new request. `/eval` sends exactly `GET /eval/dashboard` and `GET /eval/recent-runs?limit=10`. The Evals tab and the compare dialog send the same requests as before this spec. No polling is added. | component (RTL): the fetch stub records only those URLs on `/eval` and on the Evals tab |
| NFR-3 | security | No change: agent names, case names and file paths render as plain text through React escaping. Tooltips use the same plain strings. | component (RTL): `<script>alert(1)</script>` agent and case names render literally (AC-3, AC-11) |
| NFR-4 | contract consistency | No contract, server, DB or `@devdigest/shared` change. The client and server copies of `eval-ci.ts` are not touched by this spec. | manual: `git diff --stat` of the implementation touches only `client/src/**` (non-vendor), `client/messages/en/eval.json` and client docs |
| NFR-5 | i18n | Every new or changed visible string, tooltip and accessible name is a key in the `eval` namespace, camelCase and nested by section: `dashboard.*` (subtitle, `agents.*` section label, `card.*` last-run / never-run lines, pill texts and tooltips, metric captions and full names), `dashboard.recent.*` (pass header), `evalsTab.kind.*` (+ names), `history.*` (`title`, `selected` with an ICU plural or number, the "Pass" column), `compare.subtitleCaseSet` / `subtitleDifferentSets`. Keys that are no longer rendered (`dashboard.driftTitle`, `dashboard.viewEvals`, `dashboard.metricWithDelta`, `dashboard.casesColumn`, `dashboard.latestRunColumn`) are removed or left unused, decided in the plan after a call-site grep (D-7 2026-09-18). The plural "case(s)" uses `t(key, { count })` (D-7 2026-10-01). | component (RTL): no missing-message errors; i18n assertions in AC-1, AC-13, AC-14 |
| NFR-6 | verification | All AC run in `cd client && pnpm test`. `cd client && pnpm typecheck` and `pnpm build` pass. No server test changes. | manual: run all three |

Not relevant: cost (no model call; nothing reaches an LLM); reliability and observability (presentation-only change over the same data and the same error states, AC-20). No §7a LLM checklist: there is no `[new: LLM call]`.

## Inputs and provenance

| Input | Tag |
|---|---|
| Agent rows: name, `cases_total`, `latest`, `running`, `delta`, `drop` (`GET /eval/dashboard`) | `[reused: Spec B dashboard]` |
| Recent runs (`GET /eval/recent-runs?limit=10`) | `[reused: Spec D recent runs]` |
| Cases and their `expected_output.kind`, `file`, `start_line` | `[reused: Spec A eval cases]` |
| Run history, selection count | `[reused: Spec B history]` + `[deterministic: client]` (count of the effective selection) |
| Case-set size N for the compare subtitle | `[deterministic: client]` from the two `EvalSuiteRunDetail.case_ids` |
| Local timestamps and UTC tooltips | `[deterministic: client]` from `ran_at` and the browser time zone |
| Percent and point-delta texts | `[deterministic: client]` (Spec D "Formats", unchanged) |
| Labels, captions, tooltips | i18n strings in `client/messages/en/eval.json` |

No `[new: LLM call]` in this spec.

## Untrusted inputs

- **D-1 mockups** (instructor's design, relayed as text): used as layout and wording reference only. Mock values (`gpt-4.1`, `17/20`, "20-trace gold set", dates) are never copied into the UI (C-3). No instructions in them were followed.
- **Agent names** (user-authored) and **case names** (built from LLM-written finding titles), **file paths** from repo diffs: plain text and tooltips via React escaping, truncated by ellipsis, never interpreted (NFR-3).
- No untrusted text reaches a model in this spec.

## Traceability

| Source | Covered by |
|---|---|
| G-1 | AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8 |
| G-2 | AC-10, AC-11 |
| G-3 | AC-13, AC-14, AC-16, AC-17, AC-18, AC-19 |
| G-4 | AC-3, AC-9, AC-15 |
| G-5 | AC-5, AC-12 |
| G-6 | NFR-2, NFR-4 |
| US-1 | AC-2, AC-3, AC-5, AC-7, AC-8 |
| US-2 | AC-11, AC-12 |
| US-3 | AC-14, AC-15, AC-16 |
| D-1 (1) title / subtitle | AC-1 |
| D-1 (1) "AGENTS" label, row-cards, icon | AC-2, AC-3 |
| D-1 (1) model chip | NG-1, OQ-1 |
| D-1 (1) "Last run v7 · date · 17/20 pass" | AC-5, AC-6 |
| D-1 (1) sparkline | NG-2 |
| D-1 (1) RECALL / PREC / CITE big coloured numbers | AC-7 |
| D-1 (1) chevron | AC-8 |
| D-1 (1) "Run all agents" | NG-5 |
| D-1 (1) "RECENT EVAL RUNS · ALL AGENTS" + clock icon | AC-10 |
| D-1 (1) headerless card-table, bars, bold n/m, blue version | AC-11 |
| D-1 (2) per-agent page (back link, title, subtitle, metric cards) | NG-4 |
| D-1 (2) amber banner | AC-18; generated phrase NG-8 |
| D-1 (2) METRIC TREND | NG-3 |
| D-1 (2) "RECENT RUNS · 2 selected" + Compare | AC-16 |
| D-1 (2) columns RAN AT … COST | AC-13, AC-17 |
| D-1 (2) selectors, "30 days" | NG-7 |
| D-1 (3) compare subtitle | AC-19 |
| D-1 (3) uppercase tile captions, "SYSTEM PROMPT DIFF" | AC-13 |
| D-1 (3) "Promote v7" | NG-6 |
| D-1 (Spec C) POSITIVE / NEGATIVE CASE wording | AC-14 |
| D-2 bare "drop" / "running" words | AC-4 |
| D-2 "General R…" truncation | AC-9 |
| D-2 UTC timestamps | AC-12 |
| D-2 recent table header row | AC-11 |
| D-2 grey "must find" badge, truncated case name | AC-14, AC-15 |
| Design gap: colour as the only carrier | AC-4, AC-7, AC-11, AC-14, AC-18, NFR-1 |
| Design gap: loading / error / empty states not in the mockup | AC-20 |
| Design gap: never-run agent not in the mockup | AC-6 |
| Design gap: partial run not in the mockup | AC-4, AC-11, EC-3 |
| Design gap: keyboard and focus on cards | AC-8, NFR-1 |
| Design gap: headerless table for screen readers | AC-11, NFR-1 |
| Design gap: compare over different case sets | AC-19, EC-7 |
| Design gap: uppercase read letter by letter | C-6, AC-13 |
| Spec B / Spec D amendments | "Amendments to Spec B and Spec D"; AC-2, AC-5, AC-7, AC-11, AC-12, AC-16, AC-17, AC-19 |
| User request: "running" stale handling note | EC-9, NG-9 |
| EC-1 | AC-9, AC-15 |
| EC-2 | AC-7, AC-11 |
| EC-3 | AC-4, AC-5, AC-7 |
| EC-4 | AC-6, AC-16, AC-20 |
| EC-5 | AC-16 |
| EC-6 | AC-12 |
| EC-7 | AC-19 |
| EC-8 | AC-20 |
| EC-9 | NG-9 (observation only) |
| EC-10 | AC-7, AC-11, NFR-1, NG-13 |
| EC-11 | AC-2, AC-11 |
| EC-12 | AC-3, AC-11, NFR-3 |
| OQ-1 | NG-1 (default applied) |
| OQ-2 | AC-7 (default applied) |
| OQ-3 | C-15 (default applied) |

## Clarifications

All dated 2026-10-15. The source is the user's feedback relayed by the main session. Where "spec-creator decided", the user asked for the detail to be derived and will approve or revert it.

- **C-1** Where the spec lives → `specs/2026-10-15-eval-ui-design-alignment.md`, next to Specs A–D, plus one line in `specs/eval-pipeline.md` (user instruction). §2 would put a client-only spec in `client/specs/`; the user's explicit path wins, to keep the Eval Pipeline set together.
- **C-2** Scope → bring the **labels and visual structure** of the existing screens close to D-1 **without new data or behaviour**. No server or contract change, no LLM (user).
- **C-3** Mock values (`gpt-4.1`, `17/20`, "20-trace gold set") → illustrative only. Real counts come from the data. The compare subtitle says "N-case set" with N from the runs, never "20-trace" (user).
- **C-4** Subtitle → exactly the D-1 text "Regression harness across all reviewer agents · pick an agent to see its runs". The order explanation "Regressions first, then by agent name" goes: the order itself is unchanged, and the "drop" pill explains why an agent is on top (user asked for the mockup labels; spec-creator decided to drop the old sentence).
- **C-5** Cards as a list → the agent rows become `list` / `listitem` cards with no column header, because a card is not a table row. The recent runs stay a table with visually hidden headers, because they are tabular (spec-creator decided).
- **C-6** Uppercase → applied by styling. The i18n values and the DOM text stay sentence case, so screen readers do not spell "RAN AT" letter by letter, and tests query the sentence-case text (spec-creator decided).
- **C-7** Flags → small pills with visible text and a tooltip, not bare coloured words. "partial" joins "drop" and "running" because the card now shows the latest run's n/m, and a partial run's n/m reads wrong without it. The data is already in `latest.status`, so this adds no data (spec-creator decided).
- **C-8** Card run line → "Last run vN · <local time> · n/m pass" from `latest`. The separate case count is dropped for agents with a run: the mockup has none, and the run's own n/m is what was measured. It is kept for never-run agents as "Never run · N cases", where it is the only number (spec-creator decided).
- **C-9** Pass format → "n/m" without spaces, bold in the recent table, as in D-1. The change applies to the shared passed / total string, so the run history matches (spec-creator decided).
- **C-10** Local vs UTC → **local time** in the browser's time zone, `YYYY-MM-DD HH:mm` as in D-1, with the exact UTC time in a tooltip so that runs can still be compared with server logs. Rejected: (a) keep UTC, which is what the user flagged; (b) a locale-dependent format such as "Oct 15, 8:38 PM", which differs per browser and is untestable without pinning a locale (spec-creator decided).
- **C-11** Case-kind badge wording → "Positive" / "Negative", consistent with Spec C's "POSITIVE CASE" / "NEGATIVE CASE" banner. "must find" / "must not flag" are kept in the accessible name and tooltip ("Positive case · must find"), so the meaning of Spec A's kinds is not lost. Rejected: "POSITIVE CASE" as the badge text, which is too long for a row badge next to a long name (spec-creator decided).
- **C-12** "RECENT RUNS · N selected" → the history heading becomes "Recent runs". The suffix "· N selected" shows only while N ≥ 1, because "0 selected" is noise and the Compare hint already explains selection. The Compare button moves to the heading row as in D-1 (spec-creator decided).
- **C-13** The Status column stays in the history, although D-1 has none: `running` and `failed` rows would otherwise be indistinguishable from finished ones (no new data, no lost data; spec-creator decided).
- **C-14** Compare subtitle over different case sets → "… on different case sets" instead of a single N, which would be false (user asked for a truthful subtitle; spec-creator decided the wording).
- **C-15** Size → 20 AC in one module, above the ~12-AC threshold. Kept as one spec by default: every AC is presentational, in one package, and they share captions, colours and the timestamp rule. Alternative split in OQ-3 (spec-creator decided; user may override).

## Open questions

- **OQ-1** [NEEDS CLARIFICATION: Pull in the model chip? It needs either a new `agent_model` field on `EvalDashboardRow` / `EvalRecentRun` (a contract and server change, against C-2) or an extra `GET /agents` request (against NFR-2). Default: **no**, so it stays NG-1 and becomes a follow-up spec.]
- **OQ-2** [NEEDS CLARIFICATION: The card shows a small point delta under each big metric ("▲ 4 pt"), which the mockup's row does not have, so that Spec D's dashboard deltas and the meaning of "drop" stay visible. Keep it? Default: **keep** (AC-7 as written). The alternative is the number only, as in the mockup, with the delta dropped from the dashboard and Spec D AC-21 superseded in content.]
- **OQ-3** [NEEDS CLARIFICATION: Split the 20 AC into E1 "dashboard" (AC-1…AC-11, AC-20) and E2 "Evals tab, compare and shared formats" (AC-12…AC-19)? Default: **keep one spec** (C-15).]
