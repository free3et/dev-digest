---
skill: onion-architecture
version: 1.0.0
fixtures: fixtures/
expected: expected-findings.json
---

# onion-architecture — eval

One review task over a mirrored backend tree (`fixtures/`, 32 files). Five
modules plus `reviewer-core` and `e2e`; fifteen planted layering problems. The fixtures contain no
comments about the problems; the answer key is `expected-findings.json` and is
not read by the agent under test.

## Fixture tree

```
fixtures/
├── server/src/
│   ├── platform/            container.ts, errors.ts
│   └── modules/
│       ├── digests/         routes.ts, service.ts, repository.ts, helpers.ts, constants.ts
│       ├── risk/            routes.ts, service.ts, constants.ts
│       ├── exports/         service.ts, repository.ts, helpers.ts
│       ├── notifications/   routes.ts, service.ts, repository.ts, helpers.ts, constants.ts
│       ├── triage/          service.ts, repository.ts, helpers.ts, hunks.ts, constants.ts
│       └── reviews/ agents/ skills/   (import targets; clean)
├── server/src/adapters/     git/parse-hunks.ts, policy/file-policy.ts
├── reviewer-core/src/       risk.ts, review/pick-provider.ts
└── e2e/lib/                 export-expectations.ts
```

Paths inside `fixtures/` are the real repo paths, so the ring of a file is
decided by its path, the same as in the app.

## Prompt

> Review the backend code under `fixtures/` for architecture and layering
> problems before we merge it. List every problem you find. For each one give
> the file, what is wrong and where the code should live instead.

## How to run

Run the prompt **at least five times per configuration** on the same tree —
a single run cannot tell a 60% detector from a 100% one. Report, per finding,
hits/N. Configurations:

- **with skill** — the agent reads `SKILL.md` first and follows it;
- **old skill** — the same, from a snapshot of the previous version;
- **baseline** — no skill, no repo docs (`CLAUDE.md`, `.claude/`, `INSIGHTS.md`).

Do not give the agent this file or `expected-findings.json`.

## Grading

Compare the answer with `expected-findings.json`:

1. **Recall** — for each entry in `findings`, the answer flags that problem in
   that file (a different wording is fine; the same defect in the same file).
2. **Fix** — the proposed destination matches the entry's `fix` (for example a
   service-owned transaction, not a repository-owned one).
3. **Precision** — files in `must_not_flag` are not reported as violations.
   Extra findings elsewhere are listed but not counted against the run.

Pass rate = recall hits / 15. Report fix-match and false positives next to it.
A finding is discriminating when the with-skill run hits it and the baseline
does not.

## Known gaps

- No clean control tree yet, so false positives are measured only on
  `must_not_flag`.
- Findings 10–15 are saturated: v1.0.0 and v1.2.0 both hit them 5/5 (see
  `INSIGHTS.md`, 2026-10-11). Findings 10–12 are covered in v1.0.0 only by the
  generic word "internals" and that was enough. Use harder variants (re-exported
  or aliased imports, a `tx` dropped inside a helper) before claiming a
  version difference.
