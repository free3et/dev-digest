# Benchmark — skills/dependency-checker

Task model `claude-haiku-4-5` · judge `claude-sonnet-5` · 3 runs/config · sha `e15be3c-dirty` · 2026-10-11T13:21:30.379Z

## Summary (per configuration)

| metric | candidate | baseline |
|---|---|---|
| pass_rate | 100% | 67% |
| tokens_out | 4814 ± 2139 [3060–9698] (n=9) | 2451 ± 549 [1818–3179] (n=9) |
| duration_ms | 39435 ± 15864 [26569–74409] (n=9) | 23385 ± 4501 [17667–30810] (n=9) |
| num_turns | 1 ± 0 [1–1] (n=9) | 1 ± 0 [1–1] (n=9) |

**Lift:** 33% pass rate (candidate − baseline).

## Per-practice matrix

| test / practice | candidate | baseline |
|---|---|---|
| **distinguishes internal (path-alias) dependencies from external npm dependencies** | 100% (3/3) | 100% (3/3) |
| the answer explicitly distinguishes internal cross-package dependencies (the @shared/review-types alias and the direct relative import into reviewer-core/src/pipeline.js) from external npm package dependencies, rather than treating them as the same kind of dependency | 67% (2/3) | 67% (2/3) |
| the answer flags server/src/services/review-service.ts importing reviewer-core/src/pipeline.js by relative path instead of through reviewer-core's public entry point as a P0-tier or otherwise explicitly called-out issue | 100% (3/3) | 100% (3/3) |
| the answer does not claim these packages are linked via workspace:* or pnpm workspaces, since the project explicitly is not a monorepo | 100% (3/3) | 100% (3/3) |
| **full report follows the required 5-section structure with a Mermaid graph** | 100% (3/3) | 0% (0/3) |
| the report has a section named 'Scope' listing which packages (client, server, reviewer-core, e2e) were analyzed | 100% (3/3) | — |
| the report includes a Mermaid diagram (a fenced ```mermaid code block using flowchart) showing dependency relationships between packages | 100% (3/3) | — |
| the report has a section with a size breakdown table showing dependencies and their installed size, not just a vague size statement | 100% (3/3) | — |
| the report has a 'Findings & Priorities' section (or equivalently named) that groups findings under explicit severity tiers such as P0, P1, P2, or Info — not an unranked bullet list | 100% (3/3) | — |
| the report ends with a Summary section giving 3-5 concrete, actionable takeaways ordered by priority | 100% (3/3) | — |
| every finding names a specific package, dependency, or file rather than giving generic advice like 'consider optimizing dependencies' | 100% (3/3) | — |
| **severity tiers are used consistently and recommendations are specific, not vague** | 100% (3/3) | 100% (3/3) |
| findings are explicitly labeled with one of the defined severity tiers (P0, P1, P2, or Info) rather than left unranked | 100% (3/3) | 0% (0/3) |
| the three different zod versions across server, client, and reviewer-core are called out explicitly as version drift | 67% (2/3) | 100% (3/3) |
| moment being declared in server/package.json but never imported anywhere under server/src is called out explicitly as an unused dependency | 100% (3/3) | 100% (3/3) |
| each recommendation names a specific package name and package.json/file location (e.g. server/package.json, moment, zod) rather than a generic suggestion | 100% (3/3) | 100% (3/3) |
| removing a dependency (e.g. moment) is presented as a recommendation for the user to confirm, not something already executed | 100% (3/3) | 100% (3/3) |

## Flags

- `non_discriminating, cost_regression` — distinguishes internal (path-alias) dependencies from external npm dependencies
- `flaky` — distinguishes internal (path-alias) dependencies from external npm dependencies — the answer explicitly distinguishes internal cross-package dependencies (the @shared/review-types alias and the direct relative import into reviewer-core/src/pipeline.js) from external npm package dependencies, rather than treating them as the same kind of dependency
- `non_discriminating` — distinguishes internal (path-alias) dependencies from external npm dependencies — the answer flags server/src/services/review-service.ts importing reviewer-core/src/pipeline.js by relative path instead of through reviewer-core's public entry point as a P0-tier or otherwise explicitly called-out issue
- `non_discriminating` — distinguishes internal (path-alias) dependencies from external npm dependencies — the answer does not claim these packages are linked via workspace:* or pnpm workspaces, since the project explicitly is not a monorepo
- `missing_data` — full report follows the required 5-section structure with a Mermaid graph — the report has a section named 'Scope' listing which packages (client, server, reviewer-core, e2e) were analyzed
- `missing_data` — full report follows the required 5-section structure with a Mermaid graph — the report includes a Mermaid diagram (a fenced ```mermaid code block using flowchart) showing dependency relationships between packages
- `missing_data` — full report follows the required 5-section structure with a Mermaid graph — the report has a section with a size breakdown table showing dependencies and their installed size, not just a vague size statement
- `missing_data` — full report follows the required 5-section structure with a Mermaid graph — the report has a 'Findings & Priorities' section (or equivalently named) that groups findings under explicit severity tiers such as P0, P1, P2, or Info — not an unranked bullet list
- `missing_data` — full report follows the required 5-section structure with a Mermaid graph — the report ends with a Summary section giving 3-5 concrete, actionable takeaways ordered by priority
- `missing_data` — full report follows the required 5-section structure with a Mermaid graph — every finding names a specific package, dependency, or file rather than giving generic advice like 'consider optimizing dependencies'
- `non_discriminating, cost_regression` — severity tiers are used consistently and recommendations are specific, not vague
- `flaky` — severity tiers are used consistently and recommendations are specific, not vague — the three different zod versions across server, client, and reviewer-core are called out explicitly as version drift
- `non_discriminating` — severity tiers are used consistently and recommendations are specific, not vague — moment being declared in server/package.json but never imported anywhere under server/src is called out explicitly as an unused dependency
- `non_discriminating` — severity tiers are used consistently and recommendations are specific, not vague — each recommendation names a specific package name and package.json/file location (e.g. server/package.json, moment, zod) rather than a generic suggestion
- `non_discriminating` — severity tiers are used consistently and recommendations are specific, not vague — removing a dependency (e.g. moment) is presented as a recommendation for the user to confirm, not something already executed
