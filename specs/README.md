# specs/ — cross-package

Forward-looking specs for work that spans more than one package. One file per
feature: `NN-feature-name.md`. Work that lives inside a single package goes in
that package's `specs/` instead.

A spec describes **what to build and why it is done** — not how the code works
today (that is `docs/`) and not what we already rejected (that is `INSIGHTS.md`).

Feature specs are written by the `spec-creator` agent (`.claude/agents/spec-creator.md`)
or by hand in the same shape. **One spec = one behavior change.** Implementation
detail, file lists and task order belong to the plan, not here. Architecture
(module boundaries, contracts, stack, invariants) belongs to `docs/`.

**ID and file:** `Spec ID: SPEC-NN` is global across the repo. `NN` = highest
`NN-` prefix in any `specs/` directory (except `e2e/specs/`, which holds browser
flows) + 1; the file is `<module>/specs/NN-kebab-name.md`, or `specs/NN-…` here
when the feature spans packages. Older specs keep their numbers.

**Language:** Ukrainian body; code names (fields, routes, files) stay as in code.

```markdown
# Spec: <назва фічі>
Spec ID: SPEC-NN
Status: draft | approved | implemented
Supersedes: <посилання, якщо нова спека замінює попереднє рішення>

## Проблема й користувач
## Goals / Non-goals            <!-- явні межі: що НЕ робимо -->
## User stories                 <!-- якщо прояснюють поведінку -->
## Acceptance criteria (EARS)   <!-- кожен з ID: AC-1, AC-2… -->
## Edge cases
## Non-functional requirements  <!-- performance / security / a11y / observability, якщо релевантно -->
## Inputs and provenance        <!-- [reused: …] / [deterministic: …] / [new: N LLM call] -->
## Untrusted inputs             <!-- чужий текст → дані, не команди -->
## Open questions               <!-- [NEEDS CLARIFICATION: …] -->
```

### Before writing: six clarification categories

Data & loading · Display & sorting · Interactions · State & persistence ·
Feedback · Edge cases. A DevDigest checklist, not an SDD standard. An unanswered
question becomes `[NEEDS CLARIFICATION]`, never an assumption.

### Acceptance criteria: EARS

One AC = one testable statement in one of five patterns (Mavin et al.,
Rolls-Royce, IEEE RE'09). Local convention: Ukrainian triggers, `(shall)` kept
as the marker of a mandatory requirement.

| Pattern | Form |
|---|---|
| Ubiquitous | Система повинна (shall) … |
| Event-driven | КОЛИ <подія>, система повинна (shall) … |
| State-driven | ПОКИ <стан>, система повинна (shall) … |
| Unwanted behavior | ЯКЩО <умова>, ТОДІ система повинна (shall) … |
| Optional feature | ДЕ <опція ввімкнена>, система повинна (shall) … |

### Inputs and provenance

- `[reused: L03 intent]` — an already produced result is reused;
- `[deterministic: repo-intel]` — code computes the fact without an LLM;
- `[new: 1 LLM call]` — a new model call is needed.

### Review before planning

Each AC describes one testable thing · condition and reaction are clear · no
contradictions · behavior, not incidental implementation · non-goals explicit ·
every `[NEEDS CLARIFICATION]` closed (status stays `draft` until then).

The plan then links every task to an AC and a test
(`- [ ] T1 … → AC-1 → test_x`); after implementation each gets a commit, giving
the AC → task → test → commit matrix that `plan-verifier` checks.

Once shipped, either delete the spec or set `Status: implemented` and move any
durable explanation into `docs/`. Stale specs are worse than missing ones — an
agent reads them as current intent.
