# pr-self-review

Version **1.0.0** · pre-PR review of local changes with a PASS / BLOCK verdict.

Skill: [SKILL.md](SKILL.md). Path → skill routing: [routing.json](routing.json).
Collector: [scripts/collect_diff.py](scripts/collect_diff.py) (Python 3, stdlib only).
References: [checks](references/checks.md) · [severity](references/severity.md) ·
[agent prompts](references/agent-prompt.md) · [report template](references/report-template.md).

## Decisions

| Question | Decision |
| --- | --- |
| What blocks | Verified **critical** only |
| Where critical counts | **Changed lines** only; existing debt is baseline |
| Enforcement | None in git/CI — advisory gate; the user honours `BLOCK` |
| Invocation | **Manual only** (`/pr-self-review`); `disable-model-invocation: true`, so the model never starts it by itself |
| Commits / push | The user does them; the skill never commits, pushes or opens a PR |
| Waiver | Only an explicit user decision, recorded in `last.json` |
| `gh` / CI required check | Not used |

## How it uses the other skills

| Files | Skills |
| --- | --- |
| `client/src/app/**` | frontend-ui-architecture, react-best-practices, next-best-practices, typescript-expert |
| `client/src/{components,lib}/**` | frontend-ui-architecture, react-best-practices, typescript-expert |
| `client/**/*.test.tsx` | react-testing-library |
| `server/src/modules/**` | onion-architecture, fastify-best-practices, zod, drizzle-orm-patterns, postgresql-table-design, typescript-expert |
| `server/src/db/**` | drizzle-orm-patterns, postgresql-table-design, onion-architecture |
| `server/src/{adapters,platform}/**` | onion-architecture, security, typescript-expert |
| `**/vendor/shared/**` | zod, typescript-expert |
| `reviewer-core/src/**` | onion-architecture, zod, typescript-expert |
| any code | security |

The authoritative table is `routing.json`; this one is a summary.

## Sources

No external sources: the skill composes this repository's own skills and rules —
root `CLAUDE.md` (do-not-touch list, package managers, migrations rule),
`server/INSIGHTS.md` and root `INSIGHTS.md` (known debt, contract drift),
`docs/improvement-plan.md` (audit that motivated the deterministic checks).

## Changelog

- **1.0.0** — initial release; manual invocation only.
