# Skill routing

Single source of truth for which project skill applies to which change. Read by `implementation-planner` (to name skills per step), `implementer` (to load them per step) and the review, test and docs agents, so a plan never promises a skill the implementer will not apply. Update this file when skills are added or removed; the directory `.claude/skills/` is the truth, not `skills-lock.json` or `.claude/skills/README.md`.

## Routing table

| Touched path / change type | Skills |
|---|---|
| `server/**`, `reviewer-core/**`, `e2e/**`, `devdigest-mcp/**` (any backend code) | `onion-architecture` |
| Fastify route, plugin, hook, schema, error handling | `fastify-best-practices` |
| Drizzle query, schema field, relation, transaction | `drizzle-orm-patterns` |
| Table, column, index, constraint design | `postgresql-table-design` |
| Zod schema, `safeParse`, `@devdigest/shared` contract | `zod` |
| `client/**` placement: new component, hook, constant, helper, folder | `frontend-ui-architecture` |
| `client/**` component internals, hooks, state, performance | `react-best-practices` |
| `client/src/app/**`, RSC boundaries, metadata, route handlers | `next-best-practices` |
| Client tests (`*.test.tsx`) | `react-testing-library` |
| Auth, user input, file handling, secrets, new endpoints | `security` |
| Non-trivial type-level work | `typescript-expert` |
| Start and end of any non-trivial task | `engineering-insights` (read only, unless the caller says to record) |
| Diagrams in docs | `mermaid-diagram` |

`implementation-planner` and `implementer` preload only the **core** via `skills:`: `onion-architecture`, `frontend-ui-architecture`, `engineering-insights`. Every other skill in the table is loaded **on demand** through the `Skill` tool, at most once per run: the `implementer` loads what a task needs just before that task; the `implementation-planner` names skills per task from this table and loads one only when a task's design depends on it. Preloading puts the full `SKILL.md` into every turn of the agent (the old 12-skill set was ~118 KB ≈ 30k tokens per agent, multiplied by every parallel implementer), so the table, not the preload list, is what keeps plan and implementation consistent.

**Skills per agent.** The four newer agents keep narrow lists (preloading puts full skill content into context):

| Agent | Preloaded skills |
|---|---|
| `test-writer` | `react-testing-library`, `fastify-best-practices`, `onion-architecture`, `zod`, `typescript-expert`, `engineering-insights` (read only). Other skills through `Skill` (`react-best-practices`, `next-best-practices`) when the table says so. |
| `architecture-reviewer` | `onion-architecture`, `frontend-ui-architecture`, `zod`, `engineering-insights` (read only) |
| `plan-verifier` | `engineering-insights` (read only), `sdd-spec` |
| `doc-writer` | `mermaid-diagram`, `engineering-insights` (read only) |

Changing one of these lists means changing this table in the same edit.

**Sync rule.** `implementation-planner` and `implementer` use this routing table as their only skill contract. Their `skills:` lists keep the same core (above), and any change to the core changes both agent files and this paragraph in the same edit. Neither agent keeps a private skill list. **One exception:** `implementation-planner` also preloads `sdd-spec` (spec rules: review checklist, AC → task → test traceability). It governs reading a spec, not writing code; the `implementer` gets AC IDs through the plan, so it does not need it.

## Not routed

- `pr-self-review` is manual-only (`disable-model-invocation: true`). It runs after the implementer, outside both agents.
- `code-review`, `security-review`, `simplify`: review roles, not implementation. Architecture review is done by `architecture-reviewer`; checking work against a plan by `plan-verifier`. Security review has no agent.

## Commands per package

| Package | Manager | Typecheck | Test |
|---|---|---|---|
| `server` | pnpm | `pnpm typecheck` | `pnpm test`. Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`. Integration only: `pnpm exec vitest run .it.test` (needs Docker; `*.it.test.ts` self-skip without it). |
| `client` | pnpm | `pnpm typecheck` | `pnpm test`; `pnpm build` catches webpack-only import errors |
| `reviewer-core` | npm | `npm run typecheck` | `npm test` |
| `devdigest-mcp` | npm | `npm run typecheck` | `npm test` (hermetic; fake API/SSE server, no Docker) |
| `e2e` | npm | `npm run typecheck` | `npm run e2e:hermetic` (needs the full stack and agent-browser; do not run casually) |

`pnpm lint` / `pnpm arch` in `server` may not exist on every branch. Check `package.json` before relying on them.

`scripts/check-pkg.sh <pkg> [--no-typecheck] [file…]` runs one package's typecheck plus its hermetic tests — only the tests related to the given files when files are passed — and prints one line per part on success and only the TS errors / failed-test details on failure. It is the per-step check for `implementer` (and the cheapest re-check for anyone else).

`scripts/check-all.sh [--build] [--force]` runs `check-pkg.sh` for `server`, `reviewer-core`, `devdigest-mcp` and `client` once per working-tree state and caches the result in `.claude/cache/` (gitignored), keyed by a hash of HEAD + tracked diff + untracked files. It never runs `*.it.test.ts`, `e2e` or lint. In an SDD run the **main session** runs it — as the baseline before implementers start and after each wave — and passes the result into the agents' prompts; implementers do not run it themselves. `scripts/review-input.sh <out-dir>` writes `review.patch`, `manifest.txt` and `tree-hash.txt` once for reviewer agents to read by path.

## Known traps a plan must account for

- Contracts change in `@devdigest/shared` (`server/src/vendor/shared`) first. `client/src/vendor/shared` is a hand copy with no sync script, so contract changes need an explicit sync step.
- Importing a value (not a type) from `@devdigest/shared` in client code can break `next build`.
- Migrations: never invented or rewritten. Before trusting `pnpm db:generate`, check the real schema with `psql \d`; the local DB may be drifted. `db:generate` can block on an interactive rename prompt.
- A skill reaches a prompt only when both `skills.enabled` and `agent_skills.enabled` are on.
- `server/src/platform/{prompt,grounding,structured}.ts` are re-exports of `reviewer-core`. Do not edit them to change behavior.
- A `tools` allowlist does not make an agent read-only if it has Bash; `.claude/hooks/agent-guard.sh` guards the hooked agents, and `architecture-reviewer` simply has no Bash.
- Never touch `server/clones/**`, `**/src/vendor/**` (except a deliberate `vendor/shared` contract change), migrations, lockfiles.
