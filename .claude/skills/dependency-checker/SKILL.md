---
name: dependency-checker
description: >-
  Audits the dependencies of this repository and each of its packages (server,
  client, reviewer-core, e2e, devdigest-mcp, evals): draws a Mermaid graph of how
  the packages depend on each other, tabulates every declared dependency by type
  and installed size, and ends with prioritized findings (P0/P1/P2/Info) and
  recommendations. Use it whenever someone asks for a dependency check, audit or
  report, "what do we depend on", "why is node_modules so big", unused,
  duplicated or version-drifting packages, a dependency graph or scheme, how
  much a package weighs, or what to remove or upgrade — even if they never say
  "dependency checker". Read-only: it never installs, removes or edits anything.
metadata:
  version: 1.1.0
---

# Dependency Checker

Turn the repo's dependency facts into one structured report a developer can act
on in five minutes: **what we depend on, how much it weighs, what is wrong, what
to do first.**

This repo is **not a workspace monorepo**. Every package has its own
`package.json` and lockfile (`server/`, `client/`, `evals/` use pnpm;
`reviewer-core/`, `e2e/`, `devdigest-mcp/` use npm) and shares code through
tsconfig path aliases (`@devdigest/shared`, `@devdigest/reviewer-core`), not
`workspace:*`. Describe it that way; never call it a pnpm/npm workspace.

## Workflow

1. **Scope.** All directories one level under the repo root that have a
   `package.json`, unless the user names some. Never read `server/clones/**`
   (cloned user repos, including a copy of this repo) or `node_modules/**`.
2. **Collect** facts with the bundled script instead of re-deriving them by hand:
   ```bash
   node .claude/skills/dependency-checker/scripts/collect.mjs --root .
   # optional: --packages server,client   --top 10
   ```
   It prints one JSON document (packages, declared deps with installed size and
   import counts, cross-package edges, version drift, heaviest deps, a ready
   `mermaid` graph, `notes`). It is read-only and needs no network. If it cannot
   run, fall back to `package.json` + `du -sh node_modules/<dep>` + `grep` for
   imports, and say so in the report.
   JSON keys you will use: `packages[]` (`name`, `manager`, `installed`,
   `declared_size_human`, `deps[]` with `kind`, `range`, `installed_version`,
   `size_human`, `import_count`, `used_by_tooling`, `flags`;
   `undeclared_imports[]`), `internal_edges[]` (`from`, `to`, `kind` =
   `alias` | `relative`, `count`, `tests_only`, `examples`), `version_drift[]`,
   `top_heavy[]`, `mermaid`, `notes`. A package without `node_modules` has
   `null` sizes: print "n/a".
   **If the facts are already in the conversation** (manifests, `du` output,
   grep results pasted by the user or by a harness) or you have no shell, use
   them as given: do not ask for tool access or more data, skip the script, and
   write "collection: supplied by the user" in Scope. Report only what the
   supplied data shows, and label anything it does not cover "n/a".
3. **Verify before you accuse.** The script's `no-import-found` is a candidate,
   not a verdict. Before calling a dependency unused, `grep` the package for its
   name in config files, scripts, `next.config.*`, and dynamic `import()` /
   `require()`. Keep the finding only if nothing uses it.
4. **Classify and prioritize** with the tiers below.
5. **Write the report** in the structure below. Stop there.

## Severity tiers

Use these defaults; state any threshold you change.

| Tier | Meaning | Typical triggers |
| ---- | ------- | ---------------- |
| **P0** | Breaks or misleads; fix first | Import of a package not declared in `package.json` (fails on a clean install); a **relative** cross-package import in non-test code that bypasses the tsconfig alias; more than one lockfile in one package |
| **P1** | Costs weight or invites drift | Declared runtime dependency with no import and no tooling use; the same dependency on different ranges across packages (`version_drift`) when it is a runtime dependency; one dependency ≥ 25% of a package's declared size or ≥ 50 MB |
| **P2** | Hygiene | Unused `devDependency`; drift on dev tooling; `@types/*` or a build tool under `dependencies`; relative cross-package imports that appear only in tests |
| **Info** | Facts, no action | Counts and totals, package-manager mix (expected here), sizes unavailable because `node_modules` is missing, **intended** alias imports between packages |

Alias imports of `@devdigest/shared` / `@devdigest/reviewer-core` are how this
repo shares code: list them in the graph, do not flag them.

## Report structure

Use exactly these five sections, in this order, so reports are comparable.
Fill the details from `references/report-template.md`.

1. **`## 1. Scope`**: which packages were analyzed (name, path, package manager,
   whether `node_modules` was present), what was excluded and why, and the
   collection method (script or fallback).
2. **`## 2. Dependency graph`**: a fenced ` ```mermaid ` `flowchart LR`. Nodes are
   packages; solid edges are **internal** dependencies labeled `alias` or
   `relative` with an import count; dashed edges go to the heaviest external
   dependencies. The script's `mermaid` field is the starting point. One line
   under the diagram says how to read internal vs external.
3. **`## 3. Size breakdown`**: a table per package with columns
   `Dependency | Type | Version | Installed size | Used (imports)`, heaviest
   first, then a "Top 10 across the repo" table and each package's declared
   total. State that sizes are on-disk package files, not bundle size.
4. **`## 4. Findings & Priorities`**: grouped under `### P0`, `### P1`, `### P2`,
   `### Info`. Each finding is: `**ID. Package: dependency or file**`, the
   evidence (command, file path, import count), the impact in one sentence, and a
   concrete recommendation. Name a package or file in every finding; never write
   "consider optimizing dependencies".
5. **`## 5. Summary`**: 3 to 5 takeaways in priority order, each a single
   actionable sentence that points back to a finding ID.

## Rules

- **Report only.** Do not run `install`, `remove`, `update` or edit any
  `package.json`. A removal or upgrade is a recommendation for the user to
  confirm, written as "remove X" in a finding, never as something already done.
- **Never guess a number.** If `node_modules` is missing, print "n/a" and add an
  Info finding telling the user which install to run (the package's own manager).
- Respect `Do not touch` paths: `**/src/vendor/**` is ours to read but its
  contents are not to be reported as drift between packages.
- Prefer the package's own manager when a recommendation involves a command
  (`pnpm` in `server/`/`client/`/`evals/`, `npm` in the rest). Do not suggest
  running the wrong one.
- Keep it scannable: tables for numbers, one line per finding header, no prose
  walls.

<!-- ci-trigger check: no behavioural change, revert after the evals workflow is verified -->
