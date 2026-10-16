# Spec: EvalCaseModal — review an eval case before saving | Spec ID: SPEC-2026-10-13-eval-case-modal | Status: approved
Supersedes: parts of [SPEC-2026-10-12-eval-cases-and-scoring](2026-10-12-eval-cases-and-scoring.md) (Spec A): NG-2 and NG-6 in part, C-15, the request shape of `POST /findings/:id/eval-case`, and AC-5 / AC-6 (what the button does). See "Amendments to Spec A".
Depends on: Spec A (cases, scoring rules, case runner, refusal table R-1); [SPEC-2026-10-12-eval-run-history-compare](2026-10-12-eval-run-history-compare.md) (Spec B) is unaffected.
Modules: server, client, @devdigest/shared (contracts)
Approved: free3et (user), 2026-10-13

> Spec C of the Eval Pipeline (index: `specs/eval-pipeline.md`). This is the DevDigest **review agent** eval. It is unrelated to the root `evals/` package.

## Problem and user

Spec A lets a user turn an accepted or dismissed finding into an eval case with one click, and the click saves at once (D-6). The user never sees what got frozen: which diff, which PR text, what name, what expectation. They also can't tell whether the case is any good before it joins the set. A case the agent can never pass, or always passes, adds noise to every later suite run. The instructor's note (D-1) asks for the reverse. "Turn into eval case" opens an `EvalCaseModal`. There the user looks over the prefilled case, may adjust the name and the expected output, can press **Run case** to see one real result, and then saves or cancels.

## Goals / Non-goals

- **G-1** "Turn into eval case" opens a modal and saves nothing until the user clicks **Save**.
- **G-2** Before saving, the user sees the frozen input as it would be stored (diff, files, PR meta), the case name and the expected output, all derived on the server from the finding.
- **G-3** The user can edit the case name and the expected output (validated JSON). The frozen input cannot be edited.
- **G-4** **Run case** makes one real, stateless model call on the would-be case and shows passed / failed with match counts, duration and cost. It writes nothing.
- **G-5** **Save** stores the case with the user's name and expectation, and the server re-checks both. **Cancel** (and X, Escape, backdrop) discards everything with no side effect.

- **NG-1** "Run on save" (the toggle in the mockup). Save never runs the case (C-3).
- **NG-2** Editing the frozen input (`input_diff`, `input_files`, `input_meta`) from the modal or any API.
- **NG-3** Creating a case that is not seeded from a finding (the staged "New eval case" editor, D-2). Spec A NG-2 still holds for that.
- **NG-4** Renaming or editing a case after it has been saved. Spec A NG-6 still holds for saved cases.
- **NG-5** Persisting dry-run results, or showing them anywhere outside the open modal (history, dashboard, compare).
- **NG-6** A per-finding list of the dry-run's kept and dropped findings in the modal. The response carries them; the modal shows counts only.
- **NG-7** Cancelling an in-flight dry-run on the server. The port has no abort signal (D-7), so closing the modal only discards the result.
- **NG-8** More than one expectation per case (Spec A NG-3), or changing the expectation `kind` (C-5).
- **NG-9** A server-side "one dry-run in flight" lock. The rate limit (NFR-3) and the disabled Run button (AC-15) bound the spend.

## Amendments to Spec A

Spec A stays `approved`. Its body is unchanged except for a one-line "Amended by Spec C (2026-10-13)" marker next to NG-2 and C-15. Where Spec A and this spec disagree, this spec wins for the items below and Spec A wins everywhere else.

| Spec A item | Change |
|---|---|
| NG-2 (no manual case editor) | **Superseded in part.** The modal is a restricted editor: name plus an expectation of fixed shape, only for a case seeded from a finding. A free-form editor stays a non-goal (NG-3 here). |
| NG-6 (no renaming) | **Superseded in part.** The name may be set before the first save. Renaming a saved case stays a non-goal (NG-4 here). |
| C-15 (auto name, renaming is a non-goal) | **Extended.** The auto name `<file>:<start_line> <title>` (title cut to 120 chars) is now the *default*. The user may replace it before saving. |
| Contracts: `POST /findings/:id/eval-case` "request: no body" | **Extended.** The request takes an optional body `EvalCaseOverrides`. With no body, or an empty one, the behaviour is exactly Spec A's (AC-8 here). |
| AC-1, AC-2 ("`file`, `start_line`, `end_line` equal the finding's") | **Extended.** That holds when `expected_output` is not supplied. When it is supplied, the stored values are the supplied ones, subject to the R-3 checks (AC-7). |
| R-1 refusal table | **Extended** by R-3 (validation), which applies to save and dry-run. R-1 also applies to the new draft and dry-run endpoints. |
| AC-5 (eval control on the card) | **Unchanged** in its states and labels. Only the button's effect changes: it opens the modal (AC-10 here) and no longer sends `POST /findings/:id/eval-case`. |
| AC-6 (create failure shown inline on the card) | **Superseded.** Draft and save failures are shown inside the modal (AC-12, AC-19). |
| NFR-4 (rate limits) | **Extended** with a dry-run limit (NFR-3 here). The create limit of 30 per minute is unchanged. |
| NG-9 (no `agent_runs` / `run_traces`) | **Extended** to dry-runs, which also write no eval tables (AC-5). |

## User stories

- **US-1** As a user on an accepted or dismissed finding, I click "Turn into eval case" and look over the case before anything is stored.
- **US-2** As a user, I change the case name or tighten the expected line range, and I see at once whether my JSON is valid.
- **US-3** As a user, I press Run case to see whether the agent, as it is configured now, passes this case and what that cost, before I decide to keep it.
- **US-4** As a user, I save the case and the card shows "In eval set". Or I cancel and nothing has changed.

## Design references

- **D-1** text from user — the instructor's homework note on the "Turn into eval case" flow, relayed by the main session, seen 2026-10-13. Mockup content: header "Eval case · <name>", subtitle "Seeded from an accepted finding · assert the expected output". The left column has a kind banner (POSITIVE CASE "MUST find <title> at file:line", plus a negative analog), a required Name input, and read-only Input tabs Diff | Files | PR meta. The right column has "Expected output" with a "valid JSON" badge and a "Finding skeleton" button over a JSON editor, and a result box "Last run passed · expected 1 finding, got 1 · 1.8s · $0.02". The footer has Cancel / Run case / Save. The mockup's "Run on save" toggle is out of scope (C-3).
- **D-2** code — staged i18n `client/messages/en/eval.json:49-75` (`caseEditor.*`: `caseTitle`, `runCase`, `running`, `save`, `saving`, `nameLabel`, `inputLabel`, `tabs.diff`, `tabs.prMeta`, `expectedOutput`, `validJson`, `invalidJson`, `lastRunPassed`, `lastRunFailed`), seen 2026-10-13. There is no `tabs.files` key, no "Finding skeleton" key, and no kind-banner keys.
- **D-3** code — `client/src/vendor/ui/kit/Modal.tsx:4-69`: `@devdigest/ui` `Modal` renders `role="dialog"` and `aria-modal`, closes on a backdrop click and through an icon-only "Close" button. It has no Escape handling, no focus trap or focus return, and no `aria-labelledby`.
- **D-4** code — `server/src/modules/eval/case-runner.ts:65-104,121-149`: `guardProvider` (every structured request has `maxRetries: 0`, `maxTokens` 4096, `timeoutMs` 60000, raced against a 60 s timer) and `runCase` (the real review pipeline, single-pass, then `scoreCase`; it never throws, and a failure becomes `outcome: error`). Also `server/src/modules/eval/helpers.ts:219-243`: `buildCaseName`, and `truncateError` (key-like tokens redacted, cut to 300 chars).
- **D-5** code — `server/src/vendor/shared/contracts/knowledge.ts:83-134`: `EvalExpectation` (an object with a refinement `end_line ≥ start_line`; `source` block) and `EvalCase`. `server/src/modules/eval/routes.ts:27-38`: `POST /findings/:id/eval-case` declares no body schema.
- **D-6** code — `client/src/components/finding-card/EvalCaseControl/EvalCaseControl.tsx:15-59`: the button calls the create mutation directly on click. The control waits for `GET /agents/:id/eval-cases` and shows the "In eval set" link once a case has `source.finding_id` equal to the finding id.
- **D-7** curated — `server/docs/eval.md` ("One call per case": `container.llmSingleShot` is strict only for `openrouter`; `openai` / `anthropic` keep their adapters' transport retries). Server `INSIGHTS.md`: 2026-09-25 (no abort signal, so a timed-out call may still be billed), 2026-10-07 (rate limiter inert under test; a `ConfigError` becomes a 500 unless mapped; assert `maxRetries: 0` on the captured request), 2026-10-06 (capture log lines via `req.log`), 2026-09-26 (zod validation is `422`). Client `INSIGHTS.md`: 2026-09-19 (`@devdigest/ui` `Textarea` takes no `id` / `aria-label`, so labelled native controls are used), 2026-10-06 (`mockFetch` answers only 200 / 404; stub fetch for 4xx), 2026-10-01 (i18n namespaces in the test renderer).
- **D-8** spec — Spec A: Scoring rules, AC-1…AC-6, AC-10, AC-11, R-1, NFR-4, C-15. Spec B: unaffected.

## Workflow and communication

```mermaid
sequenceDiagram
  actor U as User
  participant FC as Client FindingCard eval control
  participant M as Client EvalCaseModal
  participant EV as server eval module
  participant RC as reviewer-core review pipeline + grounding gate
  participant LLM as agent's LLM provider
  participant DB as Postgres

  U->>FC: Turn into eval case
  FC->>M: open (no request that writes)
  M->>EV: GET /findings/:id/eval-case/draft
  EV->>DB: read finding, review, agent, PR, pr_files.patch (read only)
  EV-->>M: 200 EvalCaseDraft (or R-1 refusal)
  opt Run case (0..n times)
    M->>EV: POST /findings/:id/eval-case/dry-run { expected_output? }
    EV->>DB: read finding + agent config + enabled skills (read only)
    EV->>RC: server-derived frozen diff + PR meta + current system prompt + skills
    RC->>LLM: exactly one guarded structured call
    LLM-->>RC: candidate findings
    RC-->>EV: kept + dropped, cost
    EV->>EV: scoreCase (code only)
    EV-->>M: 200 EvalDryRunResult (nothing stored)
  end
  alt Save
    M->>EV: POST /findings/:id/eval-case { name?, expected_output? }
    EV->>DB: insert eval_cases row (input derived server-side)
    EV-->>M: 201 EvalCase (or R-1 / R-3 refusal)
    M-->>FC: close; card shows "In eval set"
  else Cancel / X / Escape / backdrop
    M-->>FC: close; no request, in-flight result discarded
  end
```

**Why the dry-run is keyed by a finding id (C-4).** The dry-run endpoint takes no diff, no PR text and no prompt from the caller. The server rebuilds the frozen input from the finding exactly as save would. The caller may override only the expectation, which never reaches the model: it is used only for scoring. So the endpoint cannot be used as a free LLM proxy. Every call reviews a diff that is already stored, for a decided finding of the caller's workspace, with that finding's agent's configuration.

## Contracts

| Contract | Change | Shape |
|---|---|---|
| `GET /findings/:id/eval-case/draft` | new | response `200` → `EvalCaseDraft`. Refusals: every row of Spec A R-1, same order and codes, including `409 duplicate` (+ `case_id`). Reads only |
| `POST /findings/:id/eval-case/dry-run` | new | request body optional: `{ expected_output?: EvalExpectationInput }`; unknown keys rejected. Absent `expected_output` = the derived expectation. Response `200` → `EvalDryRunResult`, also when the model call failed (`outcome: error`). Refusals: R-1, R-3, `429`, `413` |
| `POST /findings/:id/eval-case` | changed | request body optional: `EvalCaseOverrides`. No body or `{}` = Spec A behaviour. Response unchanged (`201` → `EvalCase`). Refusals: R-1, then R-3, `429`, `413` |
| `EvalExpectationInput` (`knowledge.ts`) | new | the caller-editable part of an expectation: `kind` (`must_find` \| `must_not_flag`); `file` (string, 1–1000 chars); `start_line`, `end_line` (integers ≥ 1, `end_line ≥ start_line`); `title`, `severity`, `category` (strings, at most 500 chars each). No `source`. Unknown keys rejected. Scoring reads only `kind`, `file`, `start_line`, `end_line`, as in Spec A |
| `EvalCaseOverrides` (`knowledge.ts`) | new | `name`: string, optional, trimmed, 1–500 chars; `expected_output`: `EvalExpectationInput`, optional. Unknown keys (e.g. `input_diff`, `input_meta`, `input_files`, `owner_id`, `source`, `notes`) rejected |
| `EvalCaseDraft` (`knowledge.ts`) | new | `finding_id`, `agent_id`: strings; `name`: string (the default auto name, Spec A C-15); `input_diff`: string; `input_files`: string[] (one path); `input_meta`: `EvalCaseMeta`; `expected_output`: `EvalExpectationInput` (derived from the finding; `kind` = its current decision). Each value equals what a save with no body would store at that moment |
| `EvalDryRunResult` (`eval-ci.ts`) | new | `outcome`: `passed` \| `failed` \| `error`; `pass`: boolean, nullable (null = `error`); `expectation_kind`; `matched`: boolean, nullable (null on `error`); `matched_count`: int ≥ 0, nullable (kept findings that intersect the expectation; null on `error`); `findings_kept`, `findings_dropped`: ints, nullable (null on `error`); `kept`: `Finding[]`; `dropped`: { `finding`, `reason` }[] (both empty on `error`); `duration_ms`: int; `cost_usd`: number, nullable (null = unknown: errored or timed-out call); `agent_version`: int (the agent version whose config was used); `error`: string, nullable (redacted, ≤ 300 chars) |
| `EvalExpectation`, `EvalCase` | unchanged | stored shape unchanged. `name` may now come from the user (doc comment only). `expected_output.source` is always set by the server |
| `EvalRunRecord`, `EvalSuiteRun*`, `EvalDashboardRow` | unchanged | dry-runs never appear in them |
| DB | unchanged | no new table or column |

Error envelope: the existing structured envelope, `code` as below.

**R-3 — validation refusals** (dry-run and save). They are checked after the request schema, and after R-1 in the order shown.

| Condition | Status | `code` |
|---|---|---|
| body fails `EvalCaseOverrides` / the dry-run body schema: unknown key, wrong type, `end_line < start_line`, a name that is empty after trimming or longer than 500 chars, a string over its cap | 422 | `validation_error` |
| `expected_output.file` is not the frozen diff's file (`input_files[0]`) | 422 | `file_not_in_diff` |
| `expected_output.kind` differs from the finding's decision at request time | 422 | `kind_mismatch` |
| request body larger than 16 KB | 413 | — (framework default) |

## Acceptance criteria (EARS)

"Derived" means computed by the server from the finding, its review, agent, PR and persisted patch, exactly as Spec A AC-1…AC-3 define. "Dry-run" means `POST /findings/:id/eval-case/dry-run`.

**Server**

- **AC-1** — WHEN the client requests `GET /findings/:id/eval-case/draft` for a decided finding with an agent, a persisted patch and no case, the server SHALL return `200` with an `EvalCaseDraft` whose `name`, `input_diff`, `input_files`, `input_meta` and `expected_output` equal the values a bodiless `POST /findings/:id/eval-case` would store at that moment (minus `source`), and SHALL write no row.
  - Source: G-2, US-1, C-6
  - Verify: integration (`*.it.test.ts`) — compare the draft with the case created right after it; row counts of `eval_cases`, `eval_runs`, `eval_suite_runs` unchanged by the GET

- **AC-2** — WHEN a dry-run request passes R-1 and R-3, the server SHALL make exactly one model call through `container.llmSingleShot`, whose captured request carries `maxRetries: 0`, `maxTokens` 4096 and `timeoutMs` 60000.
  - Source: G-4, C-1, D-4, D-7
  - Verify: integration — `MockLLMProvider` override: call count 1 per dry-run; fields asserted on the captured request

- **AC-3** — WHILE a dry-run executes, its model request SHALL contain the derived `input_diff`, the derived PR title and body, and the agent's current system prompt and enabled skills, and SHALL contain no repo map, callers, rank note, project context, intent or memory section (as in Spec A AC-11).
  - Source: G-4, C-1, C-4, Spec A AC-11
  - Verify: integration — captured request: the diff equals the stored-patch diff; after a system-prompt change, the next dry-run carries the new prompt and returns the new `agent_version`; excluded headings absent

- **AC-4** — WHEN the model call of a dry-run returns, the server SHALL answer `200` with an `EvalDryRunResult` scored by Spec A's Scoring rules against the supplied `expected_output` (or the derived one when absent): `outcome`, `pass`, `matched`, `matched_count`, `findings_kept`, `findings_dropped`, `kept`, `dropped`, `duration_ms`, `cost_usd`.
  - Source: G-4, US-3, C-1, D-1 (result box)
  - Verify: unit — scoring of an override vs the derived expectation; integration — a scripted mock returning one matching finding gives `passed`, `matched_count: 1`; a narrowed `start_line`/`end_line` that no longer intersects gives `failed` for `must_find`

- **AC-5** — The dry-run SHALL write no row to `eval_cases`, `eval_runs`, `eval_suite_runs`, `agent_runs` or `run_traces`, and SHALL publish no run-bus event, whatever its outcome.
  - Source: G-4, C-1, NG-5
  - Verify: integration — row counts of the five tables before and after a passed, a failed and an errored dry-run; no run-bus subscriber receives an event

- **AC-6** — IF the dry-run's model call cannot be made or fails (no provider key, timeout after 60 s, refusal, malformed output, thrown error), THEN the server SHALL answer `200` with `outcome: error`, `pass: null`, `cost_usd: null` and an `error` text redacted and cut to 300 chars as for suite cases.
  - Source: C-1, EC-7, EC-8, D-4, D-7
  - Verify: integration — no-key resolution (`ConfigError`) gives `200` with `outcome: error`, not `500`; a never-resolving mock with fake timers gives the timeout text; an error message containing `sk-…` comes back redacted

- **AC-7** — WHEN `POST /findings/:id/eval-case` carries `name` and/or `expected_output` that pass R-1 and R-3, the server SHALL store a case whose `name` is the trimmed supplied name (else the default), whose `expected_output` is the supplied expectation (else the derived one) plus a server-built `source`, and whose `input_diff`, `input_files`, `input_meta` and `owner_id` are derived.
  - Source: G-3, G-5, US-2, US-4, C-2, C-4
  - Verify: integration — save with an edited name and a narrowed range; read back the `eval_cases` row: values as supplied, `source.finding_id` = the finding, inputs equal the draft's

- **AC-8** — WHEN `POST /findings/:id/eval-case` has no body or an empty object, the server SHALL behave exactly as Spec A AC-1…AC-4 define.
  - Source: C-2 (backward compatibility), Spec A AC-1…AC-4
  - Verify: integration — the existing Spec A create tests pass unchanged; an extra case with `{}` gives the same row as no body

- **AC-9** — IF any condition of R-1 or R-3 holds, THEN `GET …/draft`, the dry-run and `POST /findings/:id/eval-case` SHALL answer with that row's status and `code`, store no case and make no model call.
  - Source: C-2, C-4, C-5, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6
  - Verify: integration — one case per R-1 and R-3 row on each endpoint that applies; a body with `input_diff` → `422 validation_error`; `file` set to another path → `422 file_not_in_diff`; finding flipped after the draft → `422 kind_mismatch`; mock call count 0 in each

**Client**

- **AC-10** — WHEN the user activates the "Turn into eval case" button of a FindingCard, the client SHALL open the `EvalCaseModal` and request `GET /findings/:id/eval-case/draft`, sending no `POST` request.
  - Source: G-1, US-1, D-1, C-6, Spec A AC-5 (amended)
  - Verify: component (RTL) — click the button; the dialog is shown; the fetch stub saw one GET of the draft and no POST

- **AC-11** — WHEN the draft has loaded, the modal SHALL show these:
  - the title "Eval case · <name>";
  - the subtitle "Seeded from an accepted finding · assert the expected output", or "Seeded from a dismissed finding · assert the expected output";
  - a kind banner as text: "POSITIVE CASE · MUST find <title> at <file>:<start_line>" for `must_find`, "NEGATIVE CASE · MUST NOT flag <title> at <file>:<start_line>" for `must_not_flag`, built from the draft's `expected_output`;
  - a labelled, required Name field holding the draft name;
  - read-only Input tabs: Diff with `input_diff` as monospace plain text, Files with `input_files`, and PR meta with number, title, repo and body (the text "no body" when `pr_body` is null);
  - a labelled "Expected output" JSON field holding the draft `expected_output` as indented JSON.
  - Source: G-2, US-1, D-1, D-2, C-5, C-7
  - Verify: component (RTL) — both kinds; each tab is reachable by role "tab" and shows its content; the Input tabs contain no editable control; a `<script>` PR body renders literally

- **AC-12** — IF the draft request fails, THEN the modal SHALL show text naming the reason (`finding_undecided`, `no_agent`, `duplicate`, `patch_unavailable`, `not_found`, rate limited, or network error) and keep Run case and Save disabled, with Cancel enabled.
  - Source: EC-1, EC-2, EC-3, G1 (gap: error state)
  - Verify: component (RTL) — fetch stubbed to `409 patch_unavailable` and to a network error (D-7: stub fetch by hand)

- **AC-13** — WHILE the Expected output field holds text, the modal SHALL show the badge "valid JSON" when the text parses and passes the R-3 checks the client can make (`EvalExpectationInput` shape, `file` equals `input_files[0]`, `kind` equals the draft kind), and otherwise "invalid JSON" plus text naming the first problem.
  - Source: G-3, US-2, D-1, D-2, EC-4, EC-5, EC-6
  - Verify: component (RTL) — malformed JSON, `end_line < start_line`, a foreign `file`, a changed `kind`, an extra `source` key → "invalid JSON" with a reason; the original draft → "valid JSON"; the badge is text, not colour alone

- **AC-14** — WHEN the user activates "Finding skeleton", the modal SHALL replace the Expected output text with the draft's derived `expected_output` as indented JSON.
  - Source: D-1, C-8
  - Verify: component (RTL) — edit the JSON into an invalid state, press the button, the field equals the draft JSON and the badge reads "valid JSON"

- **AC-15** — WHILE the Expected output is valid and no dry-run of this modal is in flight, WHEN the user activates Run case, the modal SHALL send exactly one dry-run whose `expected_output` is the parsed field content. While that request is in flight, Run case is disabled and labelled "Running…".
  - Source: G-4, US-3, C-1, EC-9
  - Verify: component (RTL) — two rapid clicks send one request; the button is disabled with "Running…" until the stub resolves; Run case is disabled while the JSON is invalid

- **AC-16** — WHEN a dry-run response arrives while the modal is open, the result box SHALL show:
  - "Last run passed" / "Last run failed";
  - the expectation and the result as text: "expected ≥ 1 matching finding, got <matched_count>" for `must_find`, "expected 0 matching findings, got <matched_count>" for `must_not_flag`;
  - the kept and dropped counts;
  - the duration in seconds with one decimal;
  - `cost_usd` in the eval UI's cost format, or "—" when null.

  On `outcome: error` it shows "Last run errored" with the `error` text instead. A newer response replaces an older one.
  - Source: G-4, US-3, D-1, D-2, C-1, EC-7, EC-8
  - Verify: component (RTL) — a passed, a failed and an errored response; null cost shows "—"; the error text renders as plain text

- **AC-17** — WHILE the Name field is empty after trimming, or the Expected output is not valid (AC-13), the Save button SHALL be disabled, and the modal SHALL show text naming which of the two blocks saving.
  - Source: G-3, D-1 (Name required), C-2
  - Verify: component (RTL) — empty name → disabled with the reason; whitespace-only name → disabled; valid name and JSON → enabled with no prior Run case

- **AC-18** — WHEN the user activates an enabled Save, the client SHALL send `POST /findings/:id/eval-case` with the trimmed `name` and the parsed `expected_output`. When the response is `201`, the client SHALL close the modal, and the FindingCard SHALL show the "In eval set" link in place of the button.
  - Source: G-5, US-4, C-2, C-3, Spec A AC-5
  - Verify: component (RTL) — request body has exactly `name` and `expected_output`; after `201` and the refreshed `GET /agents/:id/eval-cases`, the dialog is gone and the link is shown; Save during an in-flight Run case also works (EC-10)

- **AC-19** — IF Save fails, THEN the modal SHALL stay open with the user's edits, show text naming the reason (any R-1 or R-3 `code`, rate limited, or network error) and re-enable Save.
  - Source: G-5, EC-2, EC-4, EC-5, EC-6, Spec A AC-6 (superseded)
  - Verify: component (RTL) — stubbed `422 kind_mismatch` shows a text telling the user to close and reopen; `409 duplicate` shows its reason; edits are kept

- **AC-20** — WHEN the user activates Cancel or the Close (X) button, presses Escape, or clicks the backdrop, the client SHALL close the modal without sending any `POST` request.
  - Source: G-5, US-4, D-1, D-3, C-9
  - Verify: component (RTL) — each of the four ways closes the dialog; the fetch stub saw no POST after opening; the FindingCard still shows the button

- **AC-21** — IF a dry-run response arrives after its modal was closed, THEN the client SHALL show nothing from it, and a modal opened again on the same finding SHALL start with no result box and with the server's fresh draft, not the previous edits.
  - Source: EC-10, EC-11, C-9, NG-7
  - Verify: component (RTL) — open, edit, Run case (stub pending), Cancel, resolve the stub, reopen: no result box, the fields equal the new draft response

## Edge cases

- **EC-1** The finding becomes undecided between the click and the draft or save → AC-9, AC-12, AC-19 (`finding_undecided`).
- **EC-2** A case already exists for the finding: another tab saved it, or two Saves raced → AC-9 (`409 duplicate`, one row only, per Spec A AC-4), AC-12, AC-19. The card then shows the link (Spec A AC-5).
- **EC-3** The PR file has no persisted patch → AC-9, AC-12 (`patch_unavailable`). The modal never opens with an empty diff.
- **EC-4** The user types invalid JSON or breaks the shape → AC-13 (client), AC-9 (server `422 validation_error`, if the client check is bypassed).
- **EC-5** The user points `file` at a path that is not in the frozen diff → AC-13, AC-9 (`file_not_in_diff`).
- **EC-6** The finding flips accepted ↔ dismissed while the modal is open: the draft's `kind` is stale → AC-9, AC-19 (`kind_mismatch`; the user reopens to get the new kind).
- **EC-7** No provider key for the agent's provider → AC-6 (`200`, `outcome: error`, readable reason), AC-16 ("Last run errored").
- **EC-8** The model times out (60 s), refuses, or returns malformed output (e.g. a reasoning model ending `finish_reason=length`, Spec A C-22) → AC-6, AC-16. The call may still be billed (D-7) → NFR-2.
- **EC-9** Double click on Run case → AC-15 (one request).
- **EC-10** Save while a Run case is in flight: Save goes ahead. On `201` the modal closes and the late dry-run result is discarded → AC-18, AC-21.
- **EC-11** Cancel while a Run case is in flight: the server call keeps running and may be billed (NG-7), and the client discards its result → AC-21, NFR-2.
- **EC-12** Many Run case clicks in a minute → NFR-3 (`429`, shown as rate limited in the result area like any failed request).
- **EC-13** The agent is disabled: draft, dry-run and save are still allowed, as for Spec A suite runs (Spec A EC-10) → AC-2.
- **EC-14** The agent's config changes between two Run case clicks: each dry-run uses the config current at its request and reports `agent_version` → AC-3.
- **EC-15** A suite run of the agent is `running`: dry-run and save are allowed. Neither touches suite tables (AC-5), and Spec A never blocked create during a run.
- **EC-16** The user narrows `start_line`/`end_line` to lines outside every hunk → accepted (OQ-1 resolved: no line-range check, 2026-10-13). A `must_find` there can then never pass, because grounding drops findings outside hunks except full-file kinds, and Run case shows that.
- **EC-17** Long file paths, case names and PR titles → NFR-5 (truncation in the title and banner, full text in the field).
- **EC-18** A very long diff in the Diff tab → NFR-5 (scrolls inside the tab, the modal keeps its size).

## Non-functional requirements

| ID | Category | Requirement (measurable) | Verify |
|---|---|---|---|
| NFR-1 | cost | One dry-run is one model call and costs at most what one Spec A suite case costs: ≤ $0.01 on the experiment model (Spec A C-22). Its `cost_usd` is shown in the result box (AC-16). Next to Run case the modal shows the text "Runs the agent once (one paid model call)". Tests spend $0 (`MockLLMProvider` overrides for all three providers, Spec A plan N10). | manual — read `cost_usd` of a demonstration dry-run; component (RTL) — the hint text is present |
| NFR-2 | latency / reliability | A dry-run answers within 60 s plus scoring time, or reports the timeout as `outcome: error` (AC-6). A cancelled or timed-out call is not aborted and may still be billed (D-7). This is accepted and stated here, not hidden. | integration — fake-timer timeout case |
| NFR-3 | security (A06) | Dry-run is limited to 10 requests per minute (`429`). `POST /findings/:id/eval-case` keeps 30 per minute (Spec A NFR-4). The draft GET makes no model call and is not limited. | integration — an app built with a non-test `nodeEnv` (the limiter is inert under test, D-7): the 11th dry-run in a minute gets `429` |
| NFR-4 | security (A01, A08, ASI01) | Draft, dry-run and save resolve the finding inside the request's workspace, so a foreign id is `404`. The only caller-supplied fields are `name` and `expected_output`. Unknown keys are refused (no mass assignment of `input_*`, `owner_id`, `source`). Request bodies are capped at 16 KB (`413`). The model never receives caller-supplied text. The API stays loopback-only, as today. | integration — foreign-id `404` on all three; unknown-key `422`; 17 KB body `413`; the captured prompt contains no text from the request body |
| NFR-5 | accessibility (WCAG 2.2 AA) | The modal has an accessible name (its title). When it opens, focus moves into it (the Name field). Tab and Shift+Tab stay inside it. Escape closes it (AC-20). On close, focus returns to the button that opened it. Every control (Name, the tabs, the JSON field, Finding skeleton, Cancel, Run case, Save, Close) has an accessible name and visible focus. The badge, banner and result are text, never colour alone. Long paths and names truncate with an ellipsis in the title and banner without breaking the layout. A long diff scrolls inside its tab. | component (RTL) — role/name queries; focus after open and after close; Tab from the last control wraps to the first |
| NFR-6 | i18n | Every visible string has a key in the `eval` namespace under `caseEditor.*` (reusing the staged keys of D-2; new ones such as `tabs.files`, `findingSkeleton`, `banner.*`, `subtitle.*`, `result.*`, `errors.*`, `costHint` nested by section). The card button keeps its `prReview` keys. | component (RTL) — no missing-message errors |
| NFR-7 | observability | One log line per dry-run, through the request logger: `eval dry-run finding <id>: <outcome>, cost <usd or n/a>, <ms> ms`. Nothing else is persisted (AC-5). | integration — captured log line (D-7, log capture via `req.log`) |
| NFR-8 | verification | The server AC (AC-1…AC-9) and NFR-3, NFR-4, NFR-7 run in `pnpm verify:l06` (Spec A NFR-10; fails without Docker; `MockLLMProvider` only). The client AC run in `cd client && pnpm test`. | manual — run both |

Not relevant: performance of the draft GET beyond the existing single-row reads (local, single user).

**LLM feature checklist (§7a)** — `[new: 1 LLM call per Run case]`
- Cost: ≤ $0.01 per dry-run, shown as `cost_usd` in the result box. A hint before the click says the call is paid (NFR-1). It is not added to any suite or PR cost.
- Latency: ≤ 60 s. While waiting, Run case shows "Running…" and is disabled (AC-15). Cancel and Save remain usable.
- Failure: missing key, timeout, refusal or malformed output → `200` with `outcome: error` and a redacted reason, shown as "Last run errored" (AC-6, AC-16). There is no retry (`maxRetries: 0`).
- Grounding: yes. The same mandatory grounding gate as suite cases runs, and kept / dropped counts are shown.
- Trace: no `run_traces` row (AC-5). The log line of NFR-7 and the response are the only record.
- Injection: the frozen diff and PR text are untrusted → Untrusted inputs. Caller-edited fields never reach the model (C-4).

## Inputs and provenance

| Input | Tag |
|---|---|
| Finding file, lines, title, severity, category, decision | `[reused: Spec A finding scope (findings + accept/dismiss)]` |
| `input_diff`, `input_files`, `input_meta` | `[reused: pr_files.patch, pull_requests, repos — derived as Spec A AC-3]` |
| Default name | `[deterministic: eval module, Spec A C-15 auto name]` |
| Edited name, edited `expected_output` | `[new: user input]` — validated by R-3, scoring only, never sent to the model |
| Agent system prompt, provider, model, version, enabled skills | `[reused: agents + enabled skill links at dry-run time]` |
| Dry-run candidate findings | `[new: 1 LLM call per Run case]` — the agent's review of the frozen input; on failure `outcome: error` (AC-6) |
| Kept / dropped, match, pass, `matched_count` | `[deterministic: reviewer-core grounding gate + eval scoring]` |
| JSON validity badge | `[deterministic: client validation against the shared `EvalExpectationInput` shape]` |

## Untrusted inputs

- **Frozen diff, PR title and PR body** (written by PR authors): shown in the Input tabs as plain text (React escaping, monospace for the diff, never Markdown or HTML). They reach the model only through the existing review prompt assembly, which wraps them and appends the shared injection guard, exactly as a suite case does (Spec A Untrusted inputs).
- **Finding title** (LLM-written), shown in the title, banner and default name: plain text, truncated in the title and banner.
- **User-edited name and JSON**: parsed and validated on the client and again on the server (R-3). Unknown keys are refused. They are stored as data, rendered as plain text, and never sent to a model.
- **Dry-run model output and provider error text**: only counts and the redacted, ≤ 300-char `error` are rendered, as plain text (AC-16).

## Traceability

| Source | Covered by |
|---|---|
| G-1 | AC-10, AC-20 |
| G-2 | AC-1, AC-11 |
| G-3 | AC-7, AC-13, AC-14, AC-17, NG-2 |
| G-4 | AC-2, AC-3, AC-4, AC-5, AC-6, AC-15, AC-16 |
| G-5 | AC-7, AC-18, AC-19, AC-20, AC-21 |
| US-1 | AC-1, AC-10, AC-11 |
| US-2 | AC-7, AC-13, AC-14 |
| US-3 | AC-4, AC-15, AC-16 |
| US-4 | AC-7, AC-18, AC-20 |
| D-1 header / subtitle / kind banner | AC-11 |
| D-1 Name required | AC-11, AC-17 |
| D-1 Input tabs Diff, Files, PR meta (read-only) | AC-11, NG-2 |
| D-1 "valid JSON" badge, Finding skeleton | AC-13, AC-14 |
| D-1 result box | AC-16 |
| D-1 footer Cancel / Run case / Save | AC-15, AC-18, AC-20 |
| D-1 "Run on save" toggle | NG-1 |
| D-2 gap: no `tabs.files`, skeleton, banner keys | NFR-6 |
| D-3 gap: Modal has no Escape, focus trap or focus return | AC-20, NFR-5 |
| G1 gap: states (loading, error, disabled, in flight, success) | AC-11, AC-12, AC-15, AC-17, AC-18, AC-19 |
| G2 gap: long paths, names, diffs | NFR-5, EC-17, EC-18 |
| G3 gap: cost visibility before and after Run case | NFR-1, AC-16 |
| Free-LLM-proxy risk | C-4, AC-3, AC-9, NFR-4 |
| Spec A amendments (NG-2, NG-6, C-15, create body, AC-1/AC-2, AC-5, AC-6, R-1, NFR-4, NG-9) | Amendments to Spec A; AC-7, AC-8, AC-10, AC-19, NFR-3, AC-5 |
| EC-1, EC-2, EC-3 | AC-9, AC-12, AC-19 |
| EC-4, EC-5 | AC-13, AC-9 |
| EC-6 | AC-9, AC-19 |
| EC-7, EC-8 | AC-6, AC-16, NFR-2 |
| EC-9 | AC-15 |
| EC-10 | AC-18, AC-21 |
| EC-11 | AC-21, NFR-2, NG-7 |
| EC-12 | NFR-3 |
| EC-13, EC-14 | AC-2, AC-3 |
| EC-15 | AC-5 |
| EC-16 | OQ-1 resolved (accepted as default) |
| EC-17, EC-18 | NFR-5 |

## Clarifications

- **C-1** 2026-10-13 · What does Run case do → a stateless dry-run: exactly one real model call through the same single-shot guarded path as suite cases (`container.llmSingleShot`, `maxRetries: 0`, 4096 max tokens, 60 s timeout). It uses the agent's current system prompt, model and enabled skills, scores with the same code-only `scoreCase`, and returns passed / failed, match details, latency, cost and error. It writes nothing (no `eval_runs`, `eval_suite_runs`, `agent_runs`, `run_traces`, no run bus). It has a rate limit and a size cap, and its error text is redacted as for suite runs (user decision 1; source: the instructor's note, D-1).
- **C-2** 2026-10-13 · What is editable → the name (default: the Spec A auto name) and the expected output, as a validated JSON editor with a valid / invalid badge and a "Finding skeleton" template. Diff, Files and PR meta are read-only. `POST /findings/:id/eval-case` accepts an optional `name` and `expected_output`, backward-compatible. It re-validates with the same schema, requires the expectation's `file` to be in the frozen diff, keeps one case per finding (`409 duplicate`), and derives owner and input on the server (user decision 2).
- **C-3** 2026-10-13 · "Run on save" → out of scope (user decision 3).
- **C-4** 2026-10-13 · How the dry-run avoids being a free LLM proxy → it is `POST /findings/:id/eval-case/dry-run`, keyed by a finding the server resolves in the caller's workspace. The server derives the frozen input exactly as save does. The caller may supply only `expected_output`, which is used for scoring and never sent to the model. Rejected: a body carrying `input_diff` / `input_meta`, which would let any caller send arbitrary text through the agent's paid model (user preference stated in decision 2, chosen by spec-creator).
- **C-5** 2026-10-13 · Is `kind` editable → no. The JSON shows `kind` so that the edited object has the stored shape, but it must equal the finding's current decision (`422 kind_mismatch`). Accepted means must find and dismissed means must not flag (Spec A G-1). `source` is not shown and not accepted; the server always builds it. A `must_not_flag` case is presented with a "NEGATIVE CASE · MUST NOT flag …" banner and "expected 0 matching findings" in the result (decision delegated to spec-creator by the user: "decide how must_not_flag is shown").
- **C-6** 2026-10-13 · How the modal gets its prefill → a new read-only `GET /findings/:id/eval-case/draft` that returns the would-be case without persisting it, with the R-1 refusals. Opening the modal never writes (user request; endpoint chosen by spec-creator).
- **C-7** 2026-10-13 · Which Input tabs → Diff, Files, PR meta, all read-only (the instructor's note, D-1).
- **C-8** 2026-10-13 · What "Finding skeleton" inserts → the draft's derived expectation, which serves as both reset and template (decision delegated to spec-creator: "Finding skeleton inserts a template").
- **C-9** 2026-10-13 · Cancel semantics → Cancel, X, Escape and the backdrop are all Cancel: no side effects; an in-flight Run case result is discarded. Save works with or without a prior Run case. Run case cost stays visible (user request).
- **C-10** 2026-10-13 · Limits → dry-run 10 per minute; request bodies 16 KB; name 1–500 chars; expectation strings capped (`file` 1000, `title` / `severity` / `category` 500). Values chosen by spec-creator to meet the user's "rate limit and draft size cap" requirement; the user may change them before approval.

## Open questions

- **OQ-1** RESOLVED 2026-10-13 by user: default (no line-range check; only `file`). [was: Should the server refuse an `expected_output` whose `start_line`–`end_line` intersects no hunk of the frozen diff (e.g. `422 lines_not_in_diff`)? Default if unanswered: no. Only `file` is checked; a full-file finding kind can legitimately match outside hunks, and Run case reveals a `must_find` that can never pass.]
- **OQ-2** RESOLVED 2026-10-13 by user: default (keep one spec). [was: Size. The spec has 21 AC, above the ~12-AC split threshold of the spec rules (§1). It is kept as one spec because the modal is one user-visible behaviour and the user asked for a single Spec C. The default is to keep it whole; the alternative is splitting it into a server part (AC-1…AC-9) and a client part (AC-10…AC-21) before approval.]

- **C-14** 2026-10-16 · Output-token cap → Spec A C-24 raised `EVAL_MAX_OUTPUT_TOKENS` to 8192; D-4 and AC-2 above that quote `maxTokens` 4096 now mean 8192 (the dry-run shares the guard with suite runs).

- **C-15** 2026-10-16 · Per-case timeout → Spec A C-25 raised the guard timeout to 120 s; D-4 and AC-2 that quote `timeoutMs` 60000 and AC-6 / NFR-2 that say 60 s now mean 120 s (the dry-run shares the guard).
