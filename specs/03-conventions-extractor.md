# Conventions Extractor (repo → candidates → one skill)

**Status:** draft
**Packages touched:** server, client, `@devdigest/shared`

Scan a cloned repository for the house rules it already follows, show each rule with
the code that proves it, let a maintainer accept / reject / edit them, and merge the
accepted set into a single `repo-conventions` skill linked to a reviewing agent.

## Problem

Review agents only know their system prompt. Every repo also has unwritten rules —
naming, error handling, module layout, import style — that a reviewer should enforce
but nobody has written down. There is no path from "what this codebase actually does"
to a skill an agent can carry.

## Scope — in / out

**In**

- **Extract.** One structured model call proposes candidate rules from a code-built
  sample of the repo.
- **Grounding.** Code, not a second model, re-reads the cited file and verifies each
  candidate before it is stored.
- **Triage.** Accept, reject, edit a candidate.
- **One skill.** The accepted set becomes a single skill named `repo-conventions`,
  created or updated through the existing skills API and linked to an agent.
- **Modal.** A create-skill modal shows the draft, lets the user edit it, and picks
  the agent.
- **GitHub `file:line`.** Every card deep-links to the evidence line on GitHub.

**Out**

- Changing `isJunkPath` — it is shared with onboarding and review-context.
  Test files enter the extract sample through a **separate**
  `getConventionTestSamples` call, not by widening the junk filter.
- A three-state `status`, dropping or renaming any column, changing `accepted`.
- More than one skill per repo, scheduled or incremental scans.

## Decisions taken

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Sampling is **100 % code**; the model never browses | deterministic cost, reproducible scan |
| D2 | The model only **proposes**; code verifies | a candidate whose snippet is not in the cited file is dropped, not "low confidence" |
| D3 | The stored `evidence_snippet` is **sliced from the file**, never copied from the model's reply | the UI cannot show a paraphrase as if it were code |
| D4 | A wrong line number is **corrected**; an invented snippet is **dropped** | miscounting is a formatting slip, inventing code is not |
| D5 | **Reject = `DELETE`** of the row | there is no "rejected" state to store; see *Known limitation* |
| D6 | **Accept = `PATCH accepted=true`**; the skill is built **only** from `accepted = true` rows | pending rows never leak into a skill |
| D7 | Exactly **one** skill, `repo-conventions`, created once and then updated | one name to look up; no per-scan skill sprawl |
| D8 | The agent link uses **`{skill_id}` only** | see *Agent link* |
| D9 | The model comes from `FEATURE_MODELS.conventions` via `resolveFeatureModel` / `getFeatureModelOverride` | picking a cheap model is a Settings choice, not a constant |
| D10 | Test files are sampled by **`getConventionTestSamples`**, not by changing `isJunkPath` | `category: testing` can have evidence; onboarding still drops tests |

### Known limitation

`accepted` stays a boolean and there is no `status` column, so a deleted (rejected)
rule leaves no trace. **A re-scan can propose the same rule again.** This is accepted
for this homework. A re-scan replaces only rows with `accepted = false`; an accepted
row is never touched by a scan.

## Sampling

The sample the model sees is:

```
sample = CONFIG list
       + repoIntel.getConventionSamples(repoId, 12)
       + repoIntel.getConventionTestSamples(repoId, 4)
```

- **CONFIG list** — a fixed, separate list of well-known config files (`eslint.config.*`,
  `.eslintrc*`, `tsconfig*.json`, `.prettierrc*`, `.editorconfig`, `package.json`, …)
  kept in the new module's `constants.ts`. Each is read from the clone directly by
  path when it exists. It does **not** go through the rank filter.
- **`getConventionSamples(repoId, 12)`** — unchanged. It returns paths only; the
  conventions service reads their contents. It drops tests, configs, declaration files
  and migrations through `isJunkPath`, which this spec does not touch.
- **`getConventionTestSamples(repoId, 4)`** — ranked files that look like tests
  (`.test.` / `.spec.` / `__tests__/` / `/test/` / `/tests/`), still excluding
  configs, declarations and migrations. Same rank table, different keep-predicate.
- Each file is rendered to the model with a **1-based line-number gutter** so the model
  can cite a line and code can check it.
- Missing config files are skipped silently. Size caps per file and in total keep the
  prompt bounded (exact numbers are an implementation detail of stage 3).

## Data model

One migration, **ADD only**, on the existing `conventions` table:

| Column | Type | Why |
|--------|------|-----|
| `category` | `text NOT NULL DEFAULT 'general'` | grouping chip and skill section; existing rows land in `general` |
| `evidence_line` | `integer`, nullable | 1-based line of the evidence **as verified by code**, drives the GitHub link |

- `accepted` is **not touched**.
- Drizzle field ↔ SQL column are paired, never diverging in case: `category` ↔
  `category`, `evidenceLine` ↔ `evidence_line` (constructor's second argument).
- `category` is enum-typed in TypeScript (`text('category', { enum: [...] })`). A
  `CHECK` over the eight values is included **only if `drizzle-kit` generates it**;
  the migration SQL is not hand-written or hand-edited.
- Adding columns without dropping any avoids the interactive rename prompt
  (`server/INSIGHTS.md`, `db:generate is interactive`).
- **`pnpm db:generate` runs only in the implementation session, after this spec is
  approved.** `db:migrate` is likewise a separate, explicit step.

## Contracts (`@devdigest/shared` first)

Canonical copy in `server/src/vendor/shared/contracts/knowledge.ts`, hand-ported to
`client/src/vendor/shared/`. `snake_case` on the wire, mirroring the columns.

- `ConventionCategory` = `z.enum(['naming','structure','errors','testing','imports','typing','api','general'])`
- `ConventionCandidate` gains `category: ConventionCategory` and
  `evidence_line: z.number().int().positive().nullable()`; existing fields unchanged.
- `ConventionExtractResult` — the candidates plus scan counters (`proposed`,
  `dropped_ungrounded`), so "3 kept out of 12 proposed" reads as *the gate worked*.
- `ConventionSkillDraft` — the un-persisted skill (`name`, `description`, `body`,
  `evidence_files`, `convention_ids`).
- The same Zod schema drives request validation and response serialization.

## Zod field order (`ExtractionSchema`)

Field order in a `completeStructured` schema is **generation order**. Classification
and score fields go **last**:

```
rule → evidence_path → evidence_snippet → evidence_line → occurrences → category → confidence
```

With `category` and `confidence` declared before `rule`, a live scan labelled every
candidate `imports` at exactly 0.90; declared after the evidence and an `occurrences`
count, the same model produced five distinct categories and confidences from 0.50 to
0.95 (`server/INSIGHTS.md`, *What Works*). Keep a comment on the schema saying why.

## Grounding gate

For every proposed candidate, in code:

1. `evidence_path` must be one of the files that were sampled — otherwise **drop**.
2. The file is re-read; `evidence_snippet` must be substantial and must occur in it —
   otherwise **drop**.
3. If it occurs, `evidence_line` is **recomputed** from the file (a wrong model line is
   corrected, D4).
4. The stored snippet is sliced from the file at that line (D3).
5. Duplicates within one scan (same rule text) are collapsed.

Counters for proposed / dropped are returned to the client.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/repos/:id/conventions` | list stored candidates |
| `POST` | `/repos/:id/conventions/extract` | sample → propose → verify → replace `accepted = false` rows; returns `ConventionExtractResult` |
| `PATCH` | `/conventions/:id` | accept (`accepted: true`) and edit (`rule`, `category`) |
| `DELETE` | `/conventions/:id` | **reject** (D5) |
| `POST` | `/repos/:id/conventions/skill` | build the `ConventionSkillDraft` from `accepted = true` rows; persists nothing |

Routes stay thin; the module follows the existing layering
(`routes → service → repository`), reaches the model through
`settings/feature-models`, and imports no other module's `service|repository|helpers`.

## The skill

- Name **`repo-conventions`**, `type: 'convention'`, `source: 'extracted'`,
  `evidence_files` = the paths of the accepted rows. Body is grouped by category and
  built **only from `accepted = true`** rows.
- The draft endpoint persists nothing. The modal confirms, then:
  - no skill named `repo-conventions` exists → `POST /skills`;
  - one exists → `PUT /skills/:id` (the name is unique per workspace, so a second
    `POST` would fail).
- The draft respects `SKILL_BODY_MAX`.

## Agent link

The link uses **`POST /agents/:id/skills` with `{ skill_id }` only** (additive; append
with optional `order`). The `{ skill_ids: [...] }` form **replaces the agent's whole
ordered set** and would silently remove every other skill the agent has. The client
has `useSetAgentSkills` (the replacing form) but no single-id hook, so a new hook that
sends `{ skill_id }` is part of this work. Linking an already-linked skill on a
re-create must not duplicate the link.

## GitHub link

The URL is built from `repos.full_name` (`Repo.full_name`, `owner/name`) and
`repos.default_branch`:

```
https://github.com/{repos.full_name}/blob/{repos.default_branch}/{evidence_path}#L{evidence_line}
```

- Built with the existing `githubBlobUrl(repoFullName, ref, file, startLine)` in
  `client/src/lib/github-urls.ts` (its `sha` argument accepts a branch name).
- `owner` and `name` are **not** concatenated by hand; `full_name` is the source.
- `repos` stores no commit SHA, so the link points at the default branch. The local
  clone may lag behind it, so a line can be off by the drift. When `evidence_line` is
  `null`, the link omits `#L…`.

## Client

- Page `/repos/[repoId]/conventions` (`activeKeyFor` already maps it).
- Cards: rule, category chip, confidence, evidence snippet with the `file:line`
  GitHub link, and Accept / Reject / Edit actions.
- Create-skill modal: draft preview (editable), agent picker, confirm.
- One `PascalCase` folder per component with colocated `styles.ts`, `constants.ts`,
  `helpers.ts`, `*.test.tsx`.
- i18n: extend `messages/en/conventions.json`, keys `camelCase` and nested by screen
  section — never a flat list.

## Acceptance criteria

- Extract stores only candidates whose snippet exists in a sampled file; every stored
  `evidence_snippet` is byte-equal to a slice of that file.
- A candidate with a wrong `evidence_line` is stored with the corrected line; one with
  an invented snippet is not stored, and `dropped_ungrounded` counts it.
- Every stored row has a `category` from the eight values.
- Reject deletes the row; the deleted rule never appears in the skill draft.
- The skill draft contains only `accepted = true` rows.
- Creating the skill twice yields one `repo-conventions` skill (second time updates it).
- Linking to an agent leaves that agent's other skills intact.
- Each card links to `github.com/{full_name}/blob/{default_branch}/{path}#L{n}`.
- `isJunkPath` and `getConventionSamples` are unchanged; the sample includes the CONFIG
  list **and** up to 4 ranked test files from `getConventionTestSamples`.
- `pnpm db:generate` afterwards reports no schema changes; exactly one new migration.

## Open questions

- None blocking. (Deleted rules reappearing on re-scan is a recorded limitation, not
  a question.)

## Stages

1. This spec — reviewed and approved.
2. Implementation session: shared contracts → schema edit → `pnpm db:generate` (once,
   after approval) → module + grounding on `MockLLMProvider.structuredBySchema` tests.
3. Client: page, cards, modal, hooks, i18n.
4. Product idea: test files in the extract sample via `getConventionTestSamples`
   (`isJunkPath` untouched).
