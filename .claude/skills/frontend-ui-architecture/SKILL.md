---
name: frontend-ui-architecture
description: >-
  Frontend UI architecture and code organization for React + Next.js App Router:
  where components live, when and how to split them, where constants, utils/helpers,
  hooks, API access and business logic go, and when to use barrel files. Use when
  adding or moving a component, page, hook, constant or helper, when deciding
  where a piece of client code belongs, or when reviewing folder structure and
  duplication. Architecture and file placement only — not component internals
  (hooks misuse, purity, performance), which is `react-best-practices`.
  Triggers: "where should this live", "folder structure", "split this component",
  "extract to helpers", "constants file", "business logic", "barrel", "index.ts",
  "_components", "colocation", "utils vs helpers".
metadata:
  version: 1.0.0
---

# Frontend UI Architecture

Where code goes, and when to move it. Sources and rationale: [README.md](README.md)
(links) and [SOURCES.md](SOURCES.md) (annotated notes). Internals of a component
(effects, memoization, purity) → `react-best-practices`. Next.js file conventions
and RSC boundaries → `next-best-practices`.

## Core principle

**Colocate until it hurts, then promote.** Code lives next to its only consumer.
Move it up one level only when a second consumer appears — never preemptively.
Group by **feature/route**, not by technical type (no top-level dumping-ground
`components/`, `hooks/`, `utils/` trees for feature code).

## Decision table

| I have…                                        | It goes in…                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A new screen                                   | `app/<route>/page.tsx` — thin: compose, no logic                                                |
| A component used by one route                  | `app/<route>/_components/<Name>/`                                                               |
| A component used by ≥2 routes                  | `src/components/<name>/` (shared)                                                               |
| A subcomponent used only by its parent         | Nested folder inside the parent's folder                                                        |
| A value used by one component                  | `<Name>/constants.ts`                                                                           |
| A value used by several components of a feature| Feature-level `constants.ts` beside them (promote once ≥2 need it)                              |
| Styles / class maps of one component           | `<Name>/styles.ts`                                                                              |
| Pure function, one component                   | `<Name>/helpers.ts` (+ `helpers.test.ts`)                                                       |
| Pure, domain-free function (format, math, date)| `src/lib/` util (e.g. `format.ts`), only when ≥2 features use it                                |
| State, effects, handlers, derived view-model   | Custom hook; colocated `hooks/` if one component, `src/lib/hooks/*` if shared                   |
| Server data (fetch/mutate)                     | `src/lib/hooks/*` → `src/lib/api.ts`. **Components never call `fetch`.**                        |
| Preconfigured third-party instance             | `src/lib/` (API client, providers, theme) — once, not inline where first needed                 |
| Cross-component shared state                   | Context / store in `src/lib/`; server state stays in the query cache                            |
| Types / Zod contracts crossing the wire        | `@devdigest/shared` first, then consumers                                                       |
| Test                                           | Sibling `*.test.tsx` / `*.test.ts` — no parallel `__tests__/` tree                              |

## Component folder shape (repo convention)

```
FindingsPanel/
  FindingsPanel.tsx     # PascalCase, matches the folder
  index.ts              # re-exports the component only
  constants.ts          # local constants
  helpers.ts            # local pure functions
  styles.ts             # local styles
  FindingsPanel.test.tsx
  helpers.test.ts
  hooks/                # only if the component has stateful logic worth a file
  SubPart/              # nested folder for a child used only here
```

- **Graduation:** start as one file. Add a sibling file/folder only when the
  component actually grows that thing (styles → types → constants → helpers →
  tests). Do not scaffold empty files.
- "One component per file" is not a hard rule; a tiny pure subcomponent may stay
  in its parent's file. Split when it becomes non-trivial or is reused.
- No bare `.tsx` sibling of a folder-based component.

## Layering (import direction)

```
app (routes)  →  feature _components / shared components  →  lib (hooks, api, utils)  →  vendor (@devdigest/*)
```

- Imports go **down** only. `lib/` never imports from `components/` or `app/`.
- A feature/route never imports another route's `_components`. If two need it,
  promote to `src/components/`.
- Shared components do not import route-specific code.

## Logic separation

1. **Component** = render from data + trigger callbacks. No fetch, no business
   branching, no heavy computation.
2. **Hook** = everything stateful/effectful; returns `{ data, handlers }` shaped
   for the component (hooks as a boundary / port).
3. **Helper/util** = the pure core, extracted out of the hook so it is unit-testable
   without React.
4. **API module** = the only place that knows URLs and transport.

Escalate only when justified: hook → API module → shared store. A component with a
few lines of logic does **not** need a hook — the indirection has a cost.

## `utils` vs `helpers` vs `lib`

- **helpers** (`<Name>/helpers.ts`): local, tied to this component's domain.
- **utils / `lib/*.ts`**: project-agnostic pure functions, shared; no business words.
- **`lib/` preconfigured libs**: wrapped third-party clients/providers.
- Pick one word per scope and use it consistently — consistency beats the label.
- Never create a grab-bag `utils.ts`/`common.ts`/`misc.ts`; name files by what
  they do (`format.ts`, `github-urls.ts`).

## Constants

Local `constants.ts` by default. Promote component → feature → `src/lib/` only on a
second real consumer. No single global `constants.ts` for feature values. Keep
i18n strings in `messages/<locale>/*.json`, not in constants.

## Barrel files (`index.ts`)

- **OK:** a component folder's `index.ts` re-exporting its one public component;
  a real package boundary (`@devdigest/ui`, `@devdigest/shared`).
- **Avoid:** feature-wide or `components/`-wide barrels re-exporting many
  modules — they hurt tree-shaking, dev-server/`tsc` speed and create import
  cycles. Import from the concrete file instead.

## Naming

Components/folders `PascalCase`; hooks `useXxx`; non-component files
`camelCase` or `kebab-case` matching the neighbours; i18n keys `camelCase` nested
by screen section. Name folders/files by role, not by technology, when there is a
choice (`format.ts` over `stringUtils.ts`).

## Review checklist (duplication & placement)

1. Does a hook/helper/component for this already exist? Search `src/lib/hooks`,
   `src/components`, and the route's `_components` first.
2. Is the same constant/formatter defined in two places? Promote it once.
3. Does any component call `fetch`/`api` directly? Move it into a hook.
4. Does an import point upward or sideways across features? Fix the direction.
5. Did a new barrel appear beyond a component's own `index.ts`? Remove it.
6. Is there a new file with no second consumer that was placed globally? Colocate.
7. Are tests siblings of the code they cover?

## Known tension

FSD says folder names should describe purpose (`ui`, `api`, `model`, `lib`,
`config`), not technology (`components`, `hooks`). Most other guides, and this
repo, use `components/` and `hooks/`. Follow the repo; do not rename existing
folders to satisfy either side.

## Version

`1.0.0` — initial release. Bump the minor version when a rule changes, the major
version when the repo's structural convention changes (update the source notes in
SOURCES.md and links in README.md together).
