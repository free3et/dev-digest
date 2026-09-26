---
name: onion-architecture
description: >-
  Enforces a pragmatic Onion Architecture for DevDigest backend code (server/,
  reviewer-core/, e2e/): dependencies point inward, ports live inside, adapters
  and DB live outside, routes stay thin. Use when adding or changing an API route,
  service, repository, adapter, Drizzle query, Zod schema, transaction or DI
  container wiring, when deciding where backend code belongs, or when reviewing a
  backend diff for layering violations. Triggers: "onion", "layers", "service vs
  repository", "where does this query go", "port", "adapter", "container",
  "transaction", "routes.ts", "transport", "dependency rule".
metadata:
  version: 1.0.0
---

# Onion Architecture (pragmatic, for this repo)

Sources: [README.md](README.md) (links), [SOURCES.md](SOURCES.md) (notes).
Frontend placement → `frontend-ui-architecture`. Fastify mechanics →
`fastify-best-practices`; Drizzle syntax → `drizzle-orm-patterns`; Zod →
`zod`. This skill is only about **who may depend on whom, and where code goes**.

## The rule

**Code may depend on rings closer to the centre, never on rings further out.**
Inner rings define interfaces; outer rings implement them; only the composition
root binds the two. The database is not the centre — it is a detail behind a
repository. (Palermo; Stemmler.)

## Pragmatic variant — do not invent an entity layer

This repo is service + repository, not rich-domain DDD. Do **not** add
entity/aggregate classes, domain events, or use-case-per-file folders. Add a
domain model only when a module has real invariants that a pure function in
`helpers.ts` cannot express. The value here is the dependency direction, not the ceremony.

## Rings → files

| Ring                    | Files                                                                                      | May import                         |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| 1 Domain                | `helpers.ts`, `constants.ts`, `types.ts`, pure code in `@devdigest/shared`, `reviewer-core` | itself only (no IO, no libs with IO) |
| 2 Application           | `service.ts`, `run-executor.ts`-style orchestrators, port interfaces (`@devdigest/shared`)  | ring 1, ports                      |
| 3 Infrastructure        | `repository.ts` (+`repository/`), `src/db/**`, `src/adapters/**` that leave the process     | rings 1–2                          |
| 4 Transport/composition | `routes.ts`, `app.ts`, `modules/index.ts`, `platform/container.ts`, Fastify plugins        | everything (wires it together)     |

`e2e/` is **outside all rings**: black-box browser flows against the running app;
it must never import server or client source.

`reviewer-core/` is a **ring-1/2 engine shipped as a package**: no DB, GitHub or
filesystem; the LLM arrives as an injected `LLMProvider`. Keep it that way — the
server binds the concrete provider, the engine never constructs one.

Classify by behavior, not folder: code that **leaves the process** (network, disk,
subprocess, DB) is ring 3; a pure function that happens to live in `adapters/`
(e.g. `parseUnifiedDiff`) is ring 1 and services may import it.

## Where does X go

| I have…                                        | Put it in                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| HTTP parsing, status codes, Zod request schema | `routes.ts` — call one service method, map the result, return                       |
| A business rule / decision / calculation       | `helpers.ts` (pure), called by the service                                          |
| A use case (orchestrates steps)                | `service.ts` method                                                                 |
| A Drizzle query                                | `repository.ts` — the only place importing `drizzle-orm` / `db/schema`              |
| Row → DTO mapping                              | `helpers.ts` of the owning module                                                   |
| Call to LLM / GitHub / git / ast-grep / FS     | An adapter behind a port; the service receives it from the container                |
| A new external capability                      | Port interface in `@devdigest/shared` → adapter in `src/adapters/` → mock in `mocks.ts` → bind in `container.ts` |
| Multi-write use case                           | `service.ts` opens the transaction, passes `tx` to repositories                     |
| A row type two modules need                    | `src/db/rows.ts`                                                                    |
| Wire contract (request/response)               | `@devdigest/shared` first, then consumers                                           |
| A value used by one module                     | that module's `constants.ts`                                                        |

## Rules by tool

**Fastify**
- One plugin per module (`routes.ts`), registered statically in `modules/index.ts`.
- Handlers are transport only: validate → `service.method()` → serialize. No `db`,
  no `drizzle-orm`, no adapter calls, no business branching.
- Services and repositories are obtained from the container (Fastify's plugin
  system is the DI mechanism); never `new`-ed inside a handler. Never decorate
  request/reply with a shared reference type — initialise per request.
- Cross-cutting concerns (auth, rate limit, CORS, errors) are hooks/plugins in
  ring 4, not code repeated in routes.

**Zod**
- Parse at the edge, infer the type, trust it inside. Ring 1–2 code receives
  already-typed data and does not re-validate.
- Contracts change in `@devdigest/shared` first; the same schema validates the
  request and serializes the response. Declare `schema.response` on routes so the
  response allowlist is active.
- Domain/service code depends on the inferred **types**, not on route-specific
  schema objects.

**Drizzle**
- `drizzle-orm`, `db/schema` and `Db` are imported only in `repository*` files
  and `src/db/**` (and the container that constructs `db`).
- Repositories return plain row/DTO-shaped data, never query builders or
  half-built statements.
- Transactions: the service opens `db.transaction(async (tx) => …)`; repository
  methods accept an optional `tx` and use it when present. A repository never
  opens its own transaction for a multi-repository use case. Thrown error ⇒ rollback.
- Queries used in a hot path get an index in the schema.
- Do not add or rewrite migrations from this skill (see CLAUDE.md "Do not touch").

**Adapters / ports**
- Port interface lives inside (`@devdigest/shared`); concrete class outside.
  Services depend on the interface, never on `OctokitGitHubClient`,
  `AnthropicProvider`, etc.
- Every adapter has a mock in `src/adapters/mocks.ts`; tests override it through
  container `overrides`, they do not patch modules.
- Secrets are read through `SecretsProvider`, not `process.env` in services.

## Cross-module rules

- A module never imports another module's `service`, `repository`, `routes` or
  `helpers`. Share via the container (`container.reposRepo` style getters) or via
  `constants.ts` / `types.ts`. A pure mapper needed by two modules is duplicated
  on purpose rather than imported.
- Type-only imports can evade graph tools; treat "no cross-module type imports of
  repository row types" as a convention and use `src/db/rows.ts`.

## Testing per ring

| Ring | Test | Naming |
| ---- | ---- | ------ |
| 1 | Pure unit, no mocks | `helpers.test.ts` |
| 2 | Service with mock ports from `mocks.ts` | `service.test.ts` (hermetic) |
| 3 repository | Real Postgres via testcontainers | `*.it.test.ts` |
| 4 | `app.inject` with a container built from overrides | hermetic; `*.it.test.ts` if DB-backed |

Hermetic tests must not touch DB, network or filesystem.

## Enforcement (described, not shipped)

These checks are the intended mechanical guard; the config files are **not
present on this branch**, so do not claim they run. Verify before relying on them.

- **dependency-cruiser** (local paths, `severity: error`): `routes.ts` must not
  reach `^src/db/`; `service.ts`/`helpers.ts` must not reach `^src/adapters/`
  IO files; a module must not reach another module's internals (use `$1` group
  matching). Note it excludes `node_modules` and, with `tsPreCompilationDeps:
  false`, drops type-only imports.
- **ESLint `no-restricted-imports`** for package bans dependency-cruiser cannot
  see: `drizzle-orm`, `postgres`, `octokit`, `simple-git`, `openai`,
  `@anthropic-ai/sdk` outside ring 3/4.
- Quick manual checks:
  `grep -rln "db/schema\|drizzle-orm" src/modules/*/routes.ts` and the same for
  `service.ts`/`helpers.ts` must return nothing.

## Review checklist

1. Does any `routes.ts` import `drizzle-orm`, `db/schema`, or an adapter class?
2. Does any `service.ts`/`helpers.ts` import a concrete adapter or the DB?
3. Is a multi-write use case run without a transaction?
4. Does a repository return a query builder, or open its own transaction for a
   multi-repo use case?
5. Does a new external call lack a port + mock + container binding?
6. Does the module import another module's internals?
7. Does the route declare `schema.response`?
8. Is a new pure rule buried in a service instead of `helpers.ts`?
9. Did someone add entity classes / use-case folders without real invariants?
10. Does `reviewer-core` or `e2e` gain an import that breaks its ring?

## Known gaps

Current violations and their status live in `server/INSIGHTS.md` (missing
transactions, inactive `schema.response`, mixed `adapters/`). Do not duplicate
them here; when you fix one, update that entry via `engineering-insights`.

## Version

`1.0.0`. Bump minor when a rule changes, major when the ring mapping changes;
update SOURCES.md and README.md together.
