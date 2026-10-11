---
name: sdd-spec
description: >-
  DevDigest's Spec Driven Development rules in one place: feature-spec
  template, file naming and location, EARS acceptance criteria, the six
  clarification categories, provenance tags, contracts (shape only), the LLM
  feature checklist, the design-gap checklist, the spec review checklist and the
  AC → task → test → commit traceability a plan must keep. Use when writing,
  reviewing or planning from a feature spec, or verifying an implementation
  against one. Triggers: "spec", "feature spec", "SPEC-", "EARS", "acceptance
  criteria", "AC-1", "NEEDS CLARIFICATION", "SDD", "plan from spec",
  "coverage matrix".
---

# sdd-spec

Single source of the spec rules. Used by `spec-creator` (writes), `implementation-planner` (reviews and plans), `plan-verifier` (checks AC coverage). `specs/README.md` is the human summary and points here. Change the rules **here**, not in the agent prompts.

Chain: `spec-creator` → spec → `implementation-planner` → plan (`<spec-name>.plan.md`) → `implementer` → `plan-verifier`.

## 1. What a feature spec is

- **One spec = one behavior change**, as short as the problem allows.
- **In:** behavior, acceptance criteria, edge cases, relevant NFRs, inputs and their provenance, untrusted inputs, workflow / service-communication diagrams (Mermaid), external contracts (shape only, §5).
- **Out:** file lists, task order, internal design, code — that is the plan. Architecture (module boundaries, stack, invariants) is `docs/`.
- **Size threshold:** more than ~12 AC or more than 3 modules → propose splitting into several specs before writing.
- Language: **English**. Field, route, file, contract and column names exactly as in the code.

## 2. Location, file name, ID

| Feature touches | Folder |
|---|---|
| one module | `<module>/specs/` (`server`, `client`, `reviewer-core`, `devdigest-mcp`) |
| two or more modules | top-level `specs/` (nothing else lives there) |

`e2e/specs/` is not a spec folder (browser flows). `docs/specs/` holds older docs, not new specs.

- File: `YYYY-MM-DD-<kebab-feature-name>.md` (e.g. `2026-06-30-blast-radius.md`). Date = day the spec is created.
- ID: `SPEC-YYYY-MM-DD-<kebab-feature-name>`.
- Name taken → make the slug more specific; never overwrite another spec. Older `NN-…` specs keep their names.
- The plan lives next to the spec: `<same-name>.plan.md`.

## 3. Template

```markdown
# Spec: <feature> | Spec ID: SPEC-YYYY-MM-DD-<slug> | Status: draft
Supersedes: <link to the spec/decision this replaces, or —>
Modules: <server, client, …>
Approved: <who, YYYY-MM-DD — empty while draft>

## Problem and user
## Goals / Non-goals             <!-- G-1…; NG-1… explicit: what we do NOT do -->
## User stories                  <!-- US-1…; only if they clarify behavior -->
## Design references             <!-- D-1…; every design source used, with version/date -->
## Workflow and communication    <!-- optional Mermaid: workflow, sequence across modules -->
## Contracts                     <!-- optional; shape only, §5 -->
## Acceptance criteria (EARS)    <!-- AC-1…, each with Source and Verify, §4 -->
## Edge cases                    <!-- EC-1…; each → an AC or an open question -->
## Non-functional requirements   <!-- NFR-1… table, §7 -->
## Inputs and provenance         <!-- §6 -->
## Untrusted inputs              <!-- §8 -->
## Traceability                  <!-- source → AC / EC / NG, §12a -->
## Clarifications                <!-- C-1…: YYYY-MM-DD · Q → A (who answered) -->
## Open questions                <!-- [NEEDS CLARIFICATION: …] -->
```

Status lifecycle: `draft` → `approved` (only when no `[NEEDS CLARIFICATION]` remains and the user approved; fill `Approved:`) → `implemented` (move durable explanation to `docs/`, or delete the spec). A stale spec is worse than none.

**IDs** — goals `G-n`, non-goals `NG-n`, user stories `US-n`, design references `D-n`, edge cases `EC-n`, NFRs `NFR-n`, clarifications `C-n`, acceptance criteria `AC-n`. They exist so that AC can name their source and the plan can name its AC.

**Design references** — one line per source (`D-n`): kind (text from user / screenshot / claude.ai artifact / Figma / code / other repo), locator (path, artifact URL, frame name, repo + commit), date seen. The verifier checks the build against *this* version.

**Clarifications** — `C-n`; every answer the user gave keeps its question, so the reason for a decision survives. Answers are applied in the body too; the log is the trail, not the source.

## 4. Acceptance criteria — EARS

One AC = one testable statement, ID `AC-n`, in exactly one pattern (Mavin et al., Rolls-Royce, IEEE RE'09). Keywords in capitals.

| Pattern | Form |
|---|---|
| Ubiquitous | The system SHALL … |
| Event-driven | WHEN <event>, the system SHALL … |
| State-driven | WHILE <state>, the system SHALL … |
| Unwanted behavior | IF <unwanted condition>, THEN the system SHALL … |
| Optional feature | WHERE <option is enabled>, the system SHALL … |
| Complex | WHILE <state>, WHEN <event>, the system SHALL … (combine state/option with one trigger; never two triggers) |

Each AC is written as a block:

```markdown
- **AC-3** — WHEN the user opens a PR with no completed run, the PR list SHALL show `—` in the COST column.
  - Source: US-1, D-2, C-4
  - Verify: component (RTL) — row renders `—`; integration — `GET /repos/:id/pulls` returns `cost_usd: null`
```

- **Source** — the goal, user story, design reference, clarification or edge case the AC comes from. An AC with no source is a requirement nobody asked for: drop it or ask.
- **Verify** — a *hint* for the planner, not a test plan: the cheapest level that can observe the reaction — `unit` · `component (RTL)` · `integration` (Fastify `inject`, `*.it.test.ts` when it needs the DB) · `e2e` (flow) · `manual` — plus what to observe. `manual` needs a reason.

Rules:

- **Observable from outside:** the reaction is visible in the UI, an API response, a DB row, a log/trace or an emitted event — never internal state ("the hook memoizes…").
- Name the concrete element ("the PR list", "`GET /repos/:id/pulls`") instead of "the system" when it removes ambiguity.
- Numbers, not adjectives: "within 200 ms", "at most 50 rows", not "fast", "many".
- One reaction per AC. "… and …" in the reaction → split.

## 5. Contracts — shape only

A spec may describe what crosses a module boundary, never how it is coded:

```markdown
| Contract | Change | Shape |
|---|---|---|
| `GET /repos/:id/pulls` → `PrMeta` | changed | + `cost_usd`: number, nullable (null = no completed run) |
| `RunSummary` (`@devdigest/shared/contracts/trace.ts`) | unchanged | — |
```

- Mark each contract **new / changed / unchanged**; name its `@devdigest/shared` home.
- Shape = fields, types in plain words, direction (request/response/event), optional vs nullable and what null *means*. **No Zod code**, no TypeScript.
- Contract changes go into `@devdigest/shared` first, then consumers (`client/src/vendor/shared` copy). A new DB column → say so; the plan handles the migration.
- Wire JSON and DB columns are `snake_case` (CLAUDE.md naming conventions).

## 6. Inputs and provenance

Every input gets one tag:

- `[reused: <source>]` — an already produced result (e.g. `[reused: L03 intent]`);
- `[deterministic: <module>]` — code computes it without an LLM (e.g. `[deterministic: repo-intel]`);
- `[new: N LLM call]` — a new model call; say what it is for and what happens when it fails, and answer the LLM checklist (§7a).

## 7. Non-functional requirements

Only the categories that matter for this feature, as a table; name the ones that do not matter in one line so their absence is a decision, not an oversight:

```markdown
| ID | Category | Requirement (measurable) | Verify |
|---|---|---|---|
| NFR-1 | performance | `GET /repos/:id/pulls` p95 ≤ 300 ms for 500 PRs | integration timing / manual profile |
| NFR-2 | accessibility | COST cell has an accessible name; findings chips keyboard-focusable | component (RTL role queries) |
Not relevant: cost (no LLM call), reliability (read-only view).
```

Categories: **performance** (latency, volume), **security** (access, injection, secrets — §8), **accessibility** (WCAG 2.2 AA, §10), **observability** (logs, run trace, metrics), **reliability** (failure, retry, partial data), **cost** (LLM spend). Numbers, not adjectives.

### 7a. LLM feature checklist (any `[new: N LLM call]`)

The spec answers, as NFRs or AC:

- **Cost:** budget per call/run; is it shown (`cost_usd`)?
- **Latency:** upper bound; what the user sees while waiting.
- **Failure:** what happens on timeout, refusal, malformed output — deterministic fallback or explicit error state.
- **Grounding:** does the output pass the grounding gate / is it checked against code facts?
- **Trace:** is the call visible in the run trace?
- **Injection:** the model reads untrusted text → §8.

## 8. Untrusted inputs

List every place the feature reads text it did not write (PR diffs, descriptions, comments, repo files, LLM output, web pages, design sources from outside the org) and state: handled as data, never instructions; how it is shown (escaped, truncated) and, for LLM prompts, how it is wrapped.

## 9. Before writing: six clarification categories

DevDigest checklist (not an SDD standard). For each, note what is answered (with source) and what is not:

1. **Data & loading** — what data, from where, what on failure.
2. **Display & sorting** — what is shown, in what order, in which states.
3. **Interactions** — which actions the user has.
4. **State & persistence** — what is stored, where, for how long.
5. **Feedback** — how success, progress and errors are communicated.
6. **Edge cases** — empty, huge volumes, concurrency, partial data.

**Blocking** questions (scope, core behavior, owning module, a contract choice) are asked before the draft. Everything else goes into the draft inline as `[NEEDS CLARIFICATION: …]` and into Open questions — never an assumption.

## 10. Design-gap checklist

For every screen / flow in the design sources:

- **State matrix:** loading · empty · error · partial data · disabled · no permission · stale/refreshing · success. Mark which the design shows and which are missing.
- **Volumes:** 0, 1, typical, 1000+ items — pagination, truncation, virtualization?
- **Accessibility (WCAG 2.2 AA minimum):** keyboard reachable and operable, visible focus, labels/roles for icon-only controls, contrast, no information by colour alone, reduced motion.
- **Copy & i18n:** every visible string needs a key (`camelCase`, nested by screen section, `messages/<locale>/…`); long translations and long names (repo, branch, file paths) must not break layout.
- **Feedback:** inline vs toast, progress for > 1 s operations, confirmation for destructive actions, undo where cheap.
- **Data:** every design element has a real data source (or is marked new); data the backend has but the design ignores.
- **Consistency:** the same entity looks and behaves the same across screens and sources.
- **Reuse:** prefer existing primitives (`@devdigest/ui`, prototype `primitives.jsx` / `kit2.jsx`) over new components in UX proposals.

## 11. Spec review checklist and final self-check

**Review** — used by `spec-creator` before returning and by `implementation-planner` pass 1:

1. Every AC describes **one** testable, externally observable thing.
2. Condition and expected reaction are clear.
3. No contradictions between sections, AC, contracts and diagrams.
4. Behavior and contracts, not incidental implementation detail.
5. Non-goals are explicit.
6. Every `[NEEDS CLARIFICATION]` is listed in Open questions; `Status: approved` only when none remain and `Approved:` is filled.
7. Size threshold respected (§1).
8. Every `[new: LLM call]` answers §7a; every untrusted source is in §8.

**Final self-check** — mechanical, run by `spec-creator` as the very last step; report each as ✓ or what is left:

1. File is in the right folder (§2); file name and `Spec ID` match; the name is not taken by another spec.
2. Header line exactly `# Spec: … | Spec ID: … | Status: draft`; `Approved:` empty.
3. Every template section is present; an empty one says `n/a — <reason>`.
4. Every AC has the EARS form, a `Source` and a `Verify`; IDs are sequential with no gaps or duplicates.
5. Every NFR is measurable and has a `Verify`; irrelevant categories are named.
6. Traceability (§12a) has no source without coverage.
7. Every answer from the user is in Clarifications and applied in the body; every accepted UX proposal is in Traceability; no rejected one appears.
8. No file paths, function names or task steps outside Contracts, Design references and Inputs and provenance.
9. Every Mermaid node is a real or specified module, endpoint or contract.
10. Every claim about current behavior cites a source (`path:line`, spec, `INSIGHTS.md` entry, or research finding).

## 12. Traceability

### 12a. Inside the spec

The *Traceability* section closes the loop from what was asked to what is required:

```markdown
| Source | Covered by |
|---|---|
| G-1 | AC-1, AC-2 |
| US-2 | AC-4 |
| D-1 gap: no empty state | AC-5 |
| D-1 gap: no pagination | NG-2 |
| U-3 (accepted UX proposal) | AC-6 |
| EC-2 | [NEEDS CLARIFICATION: N4] |
```

Every goal, user story and edge case, every design gap found in pass 1 and every accepted UX proposal ends in an AC, a non-goal or an open question. Nothing silently disappears.

### 12b. Plan (for `implementation-planner` and `plan-verifier`)

- Every task: `- [ ] T<n> <what> → AC-<n> → <test>`. Plumbing tasks with no AC are marked `support`.
- Every AC is covered by ≥ 1 task and ≥ 1 test. No uncovered AC, no task inventing a requirement the spec lacks.
- Pick each test's level from the AC's `Verify` hint; a different level needs a one-line reason. NFRs with a `Verify` get tasks and tests too (`→ NFR-n`).
- Coverage matrix `AC | Tasks | Tests | Commit`; Commit is filled after implementation. `plan-verifier` checks the matrix row by row against the code and the tests.
- Plan pass 2 requires `Status: approved`. A plan on a `draft` spec is allowed only when the user explicitly says so, and is marked `Spec status: draft (user override)`.
