# Sources — Onion Architecture for the backend

Annotated bibliography for the `onion-architecture` skill. "Verified" = page was
opened and read in full/summarized by fetch; "snippet" = only seen in search
results, not relied upon for any claim in SKILL.md.

## Concept

- **Jeffrey Palermo — The Onion Architecture, part 1 (2008)** — *verified*
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
  Original source. "All code can depend on layers more central, but code cannot
  depend on layers further out from the core." Domain model at the centre;
  application core holds repository interfaces; UI, infrastructure and tests at
  the edge. "The database is not the center. It is external." Relies on
  dependency inversion. Authority: the originator.
- **Khalil Stemmler — Clean Node.js Architecture** — *verified*
  https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
  Same idea for Node/TS: "code can only point inwards"; use cases and
  interfaces in the domain layer, controllers and repositories (implementations)
  in infrastructure; goal is "policy vs. detail". Authority: well-known TS/DDD educator.
- **NDepend — Onion Architecture: Going Beyond Layers** — snippet
  https://blog.ndepend.com/onion-architecture-layers/
- **Marco Lenzo — The Onion Architecture explained** — snippet
  https://marcolenzo.eu/the-onion-architecture-explained/
- **itsjavi — Domain Driven Design and The Onion Architecture** — snippet
  https://blog.itsjavi.com/target-software-architectures-the-onion-architecture
- **Milan Jovanović — Clean vs Onion vs Hexagonal** — snippet
  https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal
  Consensus across comparisons: the three share one rule (dependencies point
  inward); they differ in vocabulary and ring count.
- **Thoughtworks — Demystifying software architecture patterns** — snippet
  https://www.thoughtworks.com/en-us/insights/blog/architecture/demystify-software-architecture-patterns

## Node.js + TypeScript examples

- **André Bazaglia — Clean architecture with TypeScript: DDD, Onion** — snippet
  https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- **Remo Jansen — Onion architecture in Node.js with TypeScript and InversifyJS** — snippet
  https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- **borjatur/clean-architecture-fastify-mongodb** — snippet, illustration only
  https://github.com/borjatur/clean-architecture-fastify-mongodb

## Fastify

- **Decorators** — *verified* https://fastify.dev/docs/latest/Reference/Decorators/
  Decorators share services on the instance; never decorate request/reply with a
  reference type (initialise per request in `onRequest`); same-name decorator in
  one encapsulated context throws; `dependencies` are checked at boot.
- **Plugins** — snippet https://fastify.dev/docs/latest/Reference/Plugins/
  `register` creates an encapsulated scope; the plugin system acts as
  lightweight DI without singletons/globals.
- **Hitchhiker's guide to plugins** — snippet https://fastify.dev/docs/latest/Guides/Plugins-Guide/
- **fastify-plugin** — snippet https://github.com/fastify/fastify-plugin
- **fastify/help #284 — DI best practice** — snippet https://github.com/fastify/help/issues/284

## Drizzle / repositories / transactions

- **Sentry — Atomic Repositories in Clean Architecture and TypeScript** — *verified*
  https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/
  Transaction is opened at the top (controller/use case) and passed down;
  repository methods take an optional transaction, else use the driver.
  Adopted here with one adjustment: the **service** opens it (routes stay thin).
- **Drizzle — Transactions** — snippet https://orm.drizzle.team/docs/transactions
  `db.transaction(async (tx) => …)`, throw ⇒ rollback, nested = savepoints.
- **Stemmler — DTOs, Mappers & the Repository Pattern** — snippet
  https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/
- **João Batista da Silva — Transactions with DDD and Repository Pattern** — snippet
  https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901

## Zod

- **Zod — Basic usage** — snippet https://zod.dev/basics
- **Zod — GitHub** — snippet https://github.com/colinhacks/zod
- **Anhaia — Runtime Validation in TypeScript: Where Zod Ends…** — snippet
  https://dev.to/gabrielanhaia/runtime-validation-in-typescript-where-zod-ends-and-the-type-system-begins-4e9e
  "Parse at the boundary, infer the type, trust it everywhere inside."

## Enforcement

- **dependency-cruiser — rules reference** — *verified*
  https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
  `forbidden` rules with `from`/`to` `path`/`pathNot` regexes; capture groups
  (`$1`) express "same folder allowed, other folder forbidden"; `severity: error`
  fails the build. `tsPreCompilationDeps` matters for type-only imports.
- **Ken Miyashita — Validate Dependencies According to Clean Architecture** — snippet
  https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c
- **Xebia — Taking Frontend Architecture Serious With dependency-cruiser** — snippet
  https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/

## Repo-internal grounding (not external)

`server/README.md` (adapters behind a DI container), `server/INSIGHTS.md`
(module shape, cross-module rules, `db/rows.ts`, package bans via ESLint because
dependency-cruiser excludes `node_modules`), `reviewer-core/README.md` (pure
engine, injected `LLMProvider`), `e2e/README.md` (black-box browser flows),
`server/src/platform/container.ts` (ports come from `@devdigest/shared`,
concrete adapters are bound only here).

## Excluded

Medium/dev.to listicles that restate Palermo without new reasoning; framework-
specific DI containers (Inversify, NestJS) — the repo uses a hand-written
container, so they are not normative here.
