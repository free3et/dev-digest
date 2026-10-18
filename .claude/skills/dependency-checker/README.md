# dependency-checker

Version **1.1.0** · read-only audit of the repo's dependencies.

Skill: [SKILL.md](SKILL.md) · report skeleton:
[references/report-template.md](references/report-template.md) · collector:
[scripts/collect.mjs](scripts/collect.mjs).

## What it produces

Five fixed sections: Scope, Dependency graph (Mermaid), Size breakdown,
Findings & Priorities (P0/P1/P2/Info), Summary (3–5 ordered takeaways).

## Design notes

- A script collects the numbers (declared deps, installed size, imports, alias
  and relative cross-package edges, version drift) so the model interprets
  instead of re-deriving them by hand; sizes are self size on disk.
- The repo is not a workspace, so internal dependencies are tsconfig path
  aliases and relative imports, found by resolving each import against the
  importing package's `tsconfig.json` `paths`.
- The collector's `no-import-found` is a candidate; the skill requires a grep
  before calling anything unused.

## Changelog

- **1.1.0** — use facts already supplied in the conversation instead of asking for tools.
- **1.0.0** — initial skill.
