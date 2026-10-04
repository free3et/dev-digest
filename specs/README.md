# specs/ — multi-module feature specs

**Only specs for features that touch two or more modules live here** (for
example a new endpoint plus its UI, or a `@devdigest/shared` contract change and
its consumers). A feature inside one module goes in that module's `specs/`
(`server/specs/`, `client/specs/`, `reviewer-core/specs/`,
`devdigest-mcp/specs/`). `e2e/specs/` is not a spec folder — it holds browser
flows.

A spec describes **what to build and why it is done** — not how the code works
today (that is `docs/`) and not what we already rejected (that is `INSIGHTS.md`).

**The full rules live in one place: the
[`sdd-spec`](../.claude/skills/sdd-spec/SKILL.md) skill** — template, EARS,
contracts, checklists, plan traceability. Change them there; this page is the
summary.

## Chain

`spec-creator` writes the spec → `implementation-planner` reviews it, asks
single- vs multi-agent, and writes the plan (saved next to the spec as
`<spec-name>.plan.md`) → `implementer` executes → `plan-verifier` checks the
AC coverage matrix. Agents: [`.claude/agents/README.md`](../.claude/agents/README.md).

## In short

- **One spec = one behavior change.** More than ~12 AC or 3 modules → split.
- **In:** behavior, EARS acceptance criteria (`AC-1`…, each with a `Source`
  and a `Verify` hint), edge cases, a measurable NFR table, a traceability
  table (goal / story / design gap → AC), design references, workflow /
  service-communication diagrams (Mermaid), external contracts as *shape only*
  (new / changed / unchanged, no Zod code). **Out:** file lists, task order, internal design — that is the plan.
- **Design sources** are supplied by the user (text, screenshots, claude.ai
  prototype, Figma, code, another repo), analysed for missing states, corner
  cases, accessibility, module interaction and UX, and treated as data.
- **File:** `YYYY-MM-DD-<kebab-feature-name>.md`, **ID:**
  `SPEC-YYYY-MM-DD-<kebab-feature-name>`. Older `NN-…` specs keep their names.
- **Language:** English.
- **Questions:** blocking ones first; the rest inline as
  `[NEEDS CLARIFICATION]`; every answer is logged in *Clarifications*.
- **Status:** `draft` → `approved` (no open questions, `Approved:` filled; the
  planner needs it) → `implemented`.

```markdown
# Spec: <feature> | Spec ID: SPEC-YYYY-MM-DD-<slug> | Status: draft
Supersedes: <link or —>
Modules: <server, client, …>
Approved: <who, YYYY-MM-DD>

## Problem and user
## Goals / Non-goals
## User stories
## Design references
## Workflow and communication
## Contracts
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Inputs and provenance
## Untrusted inputs
## Traceability
## Clarifications
## Open questions
```

Once shipped, either delete the spec or set `Status: implemented` and move any
durable explanation into `docs/`. Stale specs are worse than missing ones — an
agent reads them as current intent.
