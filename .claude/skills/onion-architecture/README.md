# onion-architecture

Version **1.0.0** · scope: backend layering for `server/`, `reviewer-core/`, `e2e/`
(pragmatic Onion: dependency direction, no invented entity layer).

Skill: [SKILL.md](SKILL.md). Annotated notes and verification status per source:
[SOURCES.md](SOURCES.md).

## Sources used

### Concept
- Jeffrey Palermo — The Onion Architecture, part 1: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- Khalil Stemmler — Clean Node.js Architecture: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
- NDepend — Onion Architecture: Going Beyond Layers: https://blog.ndepend.com/onion-architecture-layers/
- Marco Lenzo — The Onion Architecture explained: https://marcolenzo.eu/the-onion-architecture-explained/
- itsjavi — DDD and the Onion Architecture: https://blog.itsjavi.com/target-software-architectures-the-onion-architecture
- Milan Jovanović — Clean vs Onion vs Hexagonal: https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal
- Thoughtworks — Demystifying software architecture patterns: https://www.thoughtworks.com/en-us/insights/blog/architecture/demystify-software-architecture-patterns

### Node.js + TypeScript
- André Bazaglia — Clean architecture with TypeScript: DDD, Onion: https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- Remo Jansen — Onion architecture in Node.js with TypeScript and InversifyJS: https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- borjatur — clean-architecture-fastify-mongodb (illustration only): https://github.com/borjatur/clean-architecture-fastify-mongodb

### Fastify
- Decorators: https://fastify.dev/docs/latest/Reference/Decorators/
- Plugins: https://fastify.dev/docs/latest/Reference/Plugins/
- Hitchhiker's guide to plugins: https://fastify.dev/docs/latest/Guides/Plugins-Guide/
- fastify-plugin: https://github.com/fastify/fastify-plugin
- fastify/help #284 — DI best practice: https://github.com/fastify/help/issues/284

### Drizzle / repositories / transactions
- Drizzle — Transactions: https://orm.drizzle.team/docs/transactions
- Sentry — Atomic Repositories in Clean Architecture and TypeScript: https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/
- Khalil Stemmler — DTOs, Mappers & the Repository Pattern: https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/
- João Batista da Silva — Transactions with DDD and Repository Pattern: https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901

### Zod
- Zod — Basic usage: https://zod.dev/basics
- Zod — GitHub: https://github.com/colinhacks/zod
- Gabriel Anhaia — Runtime Validation in TypeScript: https://dev.to/gabrielanhaia/runtime-validation-in-typescript-where-zod-ends-and-the-type-system-begins-4e9e

### Enforcement
- dependency-cruiser — rules reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- Ken Miyashita — Validate Dependencies According to Clean Architecture: https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c
- Xebia — Taking Frontend Architecture Serious With dependency-cruiser: https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/

## Repo grounding

`server/README.md`, `server/INSIGHTS.md`, `reviewer-core/README.md`,
`e2e/README.md`, `server/src/platform/container.ts`. Sources justify and sharpen
the existing service + repository + container shape; they do not replace it.

## Changelog

- **1.0.0** — initial skill.
