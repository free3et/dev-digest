# Sources — Frontend/React Project Architecture

Staging file for the `frontend-ui-architecture` skill. This is an annotated
bibliography, not the skill itself — SKILL.md / README.md will be distilled
from this later. Scope is **project/code organization** (folders, file
splitting, where logic lives), not component-internals (hooks misuse, purity,
performance) — that's already covered by `.claude/skills/react-best-practices/`.

Grounding note: this repo's own convention (root `CLAUDE.md`) is PascalCase
folders per component with colocated `styles.ts` / `constants.ts` /
`helpers.ts` / `*.test.tsx`, feature logic in route-colocated `_components/`
under `client/src/app/**`, shared components in `client/src/components/`
(some with nested subcomponent folders and a colocated `hooks/`, e.g.
`diff-viewer/` and `app-shell/`), and all API access funneled through
`src/lib/hooks/*` → `src/lib/api.ts`. This matches the "colocation + feature
folders + hooks-as-boundary" consensus found below fairly closely; sources
were selected for how they justify that shape, not to second-guess it.

---

## Key takeaways per topic

**1. Where components live (folder structure vs Next.js App Router)**
- There is broad convergence on **feature-based** (or "feature-sliced")
  organization over type-based (`components/`, `hooks/`, `utils/` as
  top-level dumping grounds) once a project outgrows a small size —
  bulletproof-react, Feature-Sliced Design (FSD), and Robin Wieruch all argue
  this independently.
- Next.js App Router is explicitly **unopinionated** about this; it only
  guarantees that non-`page`/`route` files inside `app/` are never routable
  ("safe colocation by default"), and offers `_privateFolder` and
  `(routeGroup)` purely as organizational sugar, not requirements
  (nextjs.org/docs/app/getting-started/project-structure).
- Two viable strategies coexist even in official docs: colocate feature code
  *inside* `app/<route>/_components` (this repo's choice), or keep all
  application code in top-level folders outside `app/` and use `app/` purely
  for routing. Next.js says explicitly: "choose a strategy that works for you
  and your team and be consistent."
- FSD is the most prescriptive: it enforces a strict **unidirectional import
  rule** by layer (`app → pages → widgets → features → entities → shared`,
  higher layers may import lower, never the reverse) — this is a stronger
  and more mechanically-enforceable version of what bulletproof-react calls
  "shared → features → app."

**2. How to split/decompose components (file/folder level)**
- Consensus "graduation" pattern (Josh Comeau, Robin Wieruch, this repo's own
  convention): a component starts as a single file; once it grows
  subcomponents, styles, helpers, types, or tests, it becomes **its own
  folder** with those colocated as siblings, not scattered into global
  `components/`, `styles/`, `utils/` trees.
- Nobody defends strict "one component per file" as a hard rule anymore;
  Comeau explicitly calls it dogma — the trigger for splitting is when a
  component becomes "non-trivial," not a line-count or purity rule (that
  granular judgment call is react-best-practices' territory, not this
  skill's).
- Kent C. Dodds's "colocate until it hurts, then abstract" is the umbrella
  principle underneath both (1) and (2): tests, styles, and helper functions
  should sit next to the code that uses them until reuse pressure forces
  extraction — not before.

**3. Where constants live**
- Component-local constants (`constants.ts` inside the component's folder)
  are the default for anything only that component cares about — confirmed
  by Robin Wieruch's 2026 structure guide and this repo's own convention
  (`diff-viewer/constants.ts`, `app-shell/constants.ts`, `showcase/constants.ts`).
- FSD explicitly gives constants/feature-flags their own **`config` segment**
  per slice when they're slice-wide rather than component-local — i.e. the
  promotion path is component → slice/feature `config`, not straight to a
  single global `constants.ts`.
- Nobody in this research recommends a single global `constants.ts` dumping
  ground for a nontrivial app — the pattern everywhere is "colocate first,
  promote to a shared/feature-level file only once ≥2 features need the same
  value."

**4. `utils/` vs `helpers/` vs hooks vs `services/`**
- The most concrete distinction found (dev.to/itswillt via search, corroborated
  by bulletproof-react's `lib/` vs `utils/` split): **`utils`** = pure,
  project-agnostic, portable logic (string/number/date manipulation) with zero
  business meaning; **`helpers`** = same shape but tied to *this* project's
  domain vocabulary — many teams collapse this distinction and just pick one
  name consistently, which is itself the more important rule than which word
  you pick.
- **`services/`** (bulletproof-react's `api/` segment, FSD's `api` segment) is
  reserved for boundary code that talks to the outside world — HTTP clients,
  API request functions, third-party SDK wrappers — never pure logic.
- **Custom hooks** are the place for anything **stateful or React-lifecycle-
  bound**: data fetching orchestration, event handlers, effects. If the logic
  needs `useState`/`useEffect`/React context, it's a hook, not a util; if it's
  a pure function of its inputs, it's a util/helper and should be extracted
  out of the hook too (Felix Gerschau: hooks call out to plain functions for
  the actual pure computation, so the pure part is unit-testable without
  React at all).
- FSD's `lib` segment reframes this again at the slice level: "library code
  that other modules on this slice need" — i.e. `utils`/`lib` naming is about
  *scope* (this slice vs. globally shared), not just purity.

**5. Where business/domain logic lives, separate from UI**
- Two named patterns dominate, and they're compatible: **"hooks as a
  boundary"** (Felix Gerschau, Alex Kondov's hexagonal-inspired-architecture)
  — a component receives only data + callbacks from a custom hook and never
  itself contains fetch calls, calculations, or branching business rules; and
  **FSD's `model` segment** — schemas, stores, and business logic per slice,
  separate from that slice's `ui` segment.
- Kondov frames this explicitly as hexagonal/ports-and-adapters: hooks act as
  ports that hide infrastructure (HTTP, sockets, storage) from the rendering
  layer, so a component like `PostPage` only ever sees `{ post, error,
  bookmarkPost, reactToPost }` and is oblivious to how those are implemented.
  This matches this repo's own rule ("components never call fetch directly,"
  all data access through `src/lib/hooks/*`).
- Escalation path when a single hook isn't enough: hook → dedicated
  service/API module (for the infra calls) → store (for cross-component
  shared state, e.g. Zustand/Redux/TanStack Query cache) — bulletproof-react
  and FSD both encode this as separate `hooks/`, `api/`, `stores/` segments
  per feature rather than one grab-bag.
- Universal caveat repeated by Gerschau and Comeau: don't extract a hook or
  service for a component with "only a few lines of logic" — the boundary is
  worth its indirection cost only once complexity justifies it.

**6. Barrel files, naming, colocating tests/styles, when to add `lib`/`core`**
- **Barrel files are now widely discouraged inside an app** (not for a
  published package's public API): they defeat tree-shaking, slow Next.js
  Fast Refresh/dev-server and `tsc` as re-export counts grow, and cause
  circular-dependency bugs ("barrel hell"). bulletproof-react's own docs
  reversed earlier advice and now recommend direct imports over a
  feature-wide barrel. The one place they're still endorsed is a genuine
  package boundary (e.g. this repo's own `@devdigest/ui` / `@devdigest/shared`
  vendored packages) — a single front door for external consumers, not an
  internal convenience.
- **Naming**: Airbnb's React/JSX guide (still the most cited industry style
  guide) says PascalCase filenames matching the component name, one component
  per file (multiple *pure* subcomponents tolerated), and `index.jsx`/`.tsx`
  for a directory's root component — directly consonant with this repo's
  "PascalCase folder per component" rule.
- **Colocating tests/styles** is Kent C. Dodds's colocation principle applied
  narrowly: tests and styles next to the component they cover, not mirrored
  into parallel `__tests__/` or `styles/` trees — this is exactly this repo's
  convention (`*.test.tsx`, `styles.ts` siblings).
- **When to introduce a `lib/`/`core` layer**: bulletproof-react's `lib/`
  holds *preconfigured third-party libraries* (e.g. a configured axios
  instance, a configured date library) — distinct from `utils/` (own pure
  code). FSD's `shared` layer plays the same "framework-agnostic, no business
  meaning, safe to import from anywhere" role at the whole-app level. The
  trigger for introducing either is the same: once wrapping/configuring an
  external dependency for reuse becomes necessary, don't inline that setup
  in the first component that needed it.

---

## Topic 1 — Where components live: folder structure & Next.js App Router mapping

- **bulletproof-react — Project Structure**
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
  Full reference project layout (`app/`, `components/`, `features/`, `hooks/`,
  `lib/`, `stores/`, `types/`, `utils/`) with a feature folder's internal
  shape (`api/`, `components/`, `hooks/`, `stores/`, `types/`, `utils/`) and
  an explicit **unidirectional codebase architecture**: shared modules can be
  imported anywhere, features can only import shared (never each other), app
  can import features + shared but not vice versa, enforceable via
  `import/no-restricted-paths`. Authority: large, widely-forked (30k+ star)
  community consensus repo, actively maintained.

- **Next.js — Project structure and organization (official docs)**
  https://nextjs.org/docs/app/getting-started/project-structure
  Official, current (v16.3.5, updated 2026-07-21) reference for App Router
  file/folder conventions: route files, private folders (`_folder`), route
  groups (`(folder)`), the `src/` folder, and — most relevant here — the
  "Organizing your project" section laying out three coexisting strategies
  (files outside `app/`, files in top-level folders inside `app/`, files
  split by feature/route inside `app/`) with the explicit statement that
  Next.js is "unopinionated" and colocation inside `app/` is safe by default
  because only `page`/`route` output is ever sent to the client. Authority:
  official framework docs, highest authority for anything App-Router-specific.

- **Feature-Sliced Design — Overview**
  https://feature-sliced.design/docs/get-started/overview
  Defines the layers/slices/segments hierarchy (App, Pages, Widgets,
  Features, Entities, Shared) and the strict rule that a layer may only
  import from layers strictly below it. More rigorous/mechanical than
  bulletproof-react's looser "shared → features → app," useful as the
  stricter end of the spectrum to cite. Authority: dedicated open-source
  methodology with its own documentation site and maintained GitHub org
  (`feature-sliced/documentation`) — large community consensus artifact,
  most associated with the Russian/EU frontend community and adopted beyond
  React (works with Vue too, so it's framework-level thinking, not React-
  specific tricks).

- **Feature-Sliced Design — Slices and segments (reference)**
  https://feature-sliced.design/docs/reference/slices-segments
  Defines the five standard segments (`ui`, `api`, `model`, `lib`, `config`)
  and their technical purpose, plus a naming principle directly useful for
  question 3/4: segment (and by extension, folder) names should describe
  *what the code does*, not *what technology it uses* — explicitly calling
  out `components`, `hooks`, `types` as "not that helpful" names. This is in
  tension with bulletproof-react and most other guides, which do name folders
  `hooks/`/`utils/`/`components/` — worth flagging as a live disagreement.

- **Robin Wieruch — React Folder Structure Best Practices [2026]**
  https://www.robinwieruch.de/react-folder-structure/
  Actively updated (May 2026) practical guide walking from a flat/small
  project up to 100k+ LOC organization; shows the progressive extraction of
  `styles.ts`, `types.ts`, `constants.ts`, `utils.ts`, `test.ts` alongside a
  growing component before promoting anything to a shared location. Authority:
  individual recognized expert (long-running, widely cited React/JS
  educator), practically oriented rather than dogmatic.

- **Next.js Colocation template (community reference implementation)**
  https://github.com/arhamkhnz/next-colocation-template
  A working, opinionated implementation of colocation-first App Router
  structure (TypeScript + Tailwind + shadcn/ui) that operationalizes the
  official docs' "split by feature/route" strategy — useful as a concrete
  example to point to, secondary/community authority only (single-author
  template, not consensus-level, use for illustration not as a normative
  citation).

## Topic 2 — Splitting/decomposing components (file & folder level)

- **Josh W. Comeau — Delightful React File/Directory Structure**
  https://www.joshwcomeau.com/react/file-structure/
  Concrete walkthrough of the "graduation" pattern: a component starts as one
  file, then becomes a folder with a main `ComponentName.tsx`, colocated
  subcomponents used only by the parent, `ComponentName.helpers.ts`,
  `ComponentName.types.ts`, and an `index.ts` re-export. Explicitly rejects
  "one component per file" as dogma; the real trigger is "the component
  became non-trivial." Authority: individual recognized expert, one of the
  most-cited modern React educators, strong concrete reasoning rather than
  rules-for-rules'-sake.

- **Robin Wieruch — React Folder Structure Best Practices [2026]**
  (see above) — same source also answers this question directly: shows the
  exact moment/order in which a component sprouts `styles.ts` → `types.ts` →
  `constants.ts` → `utils.ts` → `test.ts` as siblings before ever being
  promoted out of local scope.

- **Kent C. Dodds — Colocation**
  https://kentcdodds.com/blog/colocation
  The foundational argument for *why* file/folder splitting should follow
  colocation rather than type-based grouping: "place code as close to where
  it's relevant as possible," "colocate until it hurts, then abstract."
  Concrete call-outs: tests next to the code they test (not a parallel
  `test/` tree), CSS-in-JS/styles next to components, state colocated to the
  component that needs it, one stated exception (e2e tests belong at the
  project root since they span the whole system). Authority: individual
  recognized expert (former React core-adjacent educator, Remix/Epic
  Web/Testing Library), this specific post is one of the most-cited pieces
  in the entire React community on this exact question.

## Topic 3 — Where constants live (local vs shared/global)

- **Robin Wieruch — React Folder Structure Best Practices [2026]**
  (see above) — shows component-local `constants.ts` as a standard colocated
  file, extracted only once the component file itself grows unwieldy.

- **Feature-Sliced Design — Slices and segments**
  (see above) — gives the promotion path once a constant/flag is no longer
  single-component-local: a slice-level `config` segment ("configuration
  files and feature flags"), i.e. constants graduate component → feature/
  slice `config`, not straight to one global file.

- **bulletproof-react — Project Structure**
  (see above) — implicitly answers this by having no dedicated "constants"
  top-level folder at all; project-wide constants fall under `config/`
  ("global configurations"), reinforcing that a flat global `constants.ts` is
  not the community-consensus destination for anything beyond a couple of
  truly universal values.

## Topic 4 — `utils/` vs `helpers/` vs hooks vs `services/`

- **bulletproof-react — Project Structure**
  (see above) — draws the `lib/` vs `utils/` line explicitly: `lib/` is
  "preconfigured reusable libraries" (third-party wrapping/config), `utils/`
  is your own pure utility functions; `api/` segment inside each feature
  plays the `services/` role (feature-specific API requests and hooks).

- **Feature-Sliced Design — Slices and segments**
  (see above) — `api` segment = "backend interactions: request functions,
  data types, mappers"; `lib` segment = "library code other modules *on this
  slice* need" (i.e., scoped, not global); `model` segment = "the data model:
  schemas, interfaces, stores, and business logic" — the closest FSD
  equivalent to a "domain/business logic" bucket, kept explicitly separate
  from `ui`.

- **Felix Gerschau — Separation of concerns with React hooks**
  https://felixgerschau.com/react-hooks-separation-of-concerns/
  Gives the concrete decision rule for hook vs. plain function: extract a
  custom hook for anything stateful/effectful, but *further* extract the
  pure computational core (e.g., `calculateExponent()`) into a standalone,
  framework-agnostic function — this is effectively the `utils`/`helpers`
  layer sitting underneath the hook layer, each testable independently.
  States the pragmatic caveat: don't bother for a component with only a few
  lines of logic. Authority: individual recognized expert/blogger, widely
  shared and referenced piece on this specific pattern.

- **"What's the difference between helpers and utils?" (community discussion)**
  https://github.com/erikras/react-redux-universal-hot-example/issues/808
  Source of the sharpest concrete distinction found: `utils` = generic,
  project-agnostic, copy-pasteable between projects (string/date/math
  manipulation); `helpers` = project/business-specific, not meaningfully
  reusable elsewhere. Authority: individual GitHub issue discussion on a
  once-popular boilerplate repo — not a formal guide, but the clearest
  articulation of a distinction most other sources gesture at without
  defining; treat as illustrative rather than binding.

## Topic 5 — Where business/domain logic lives (hooks, service/domain layer, stores)

- **Felix Gerschau — Separation of concerns with React hooks**
  (see above) — the core "hooks as boundary" argument: a custom hook
  encapsulates all state/handlers, returns only what the component needs to
  render, keeping the component itself pure-rendering.

- **Alex Kondov — Hexagonal-Inspired Architecture in React**
  https://alexkondov.com/hexagonal-inspired-architecture-in-react/
  Takes the hooks-as-boundary idea further, framing it explicitly as
  ports-and-adapters: hooks are "ports" that hide infrastructure (HTTP,
  sockets, storage) from rendering; a `PostPage` component receives only
  `{ post, error, bookmarkPost, reactToPost }` and is oblivious to how those
  are implemented. Useful vocabulary (hexagonal architecture) for framing why
  this repo's "components never call fetch directly" rule exists. Authority:
  individual recognized expert (Alex Kondov, "Tao of React" author, frequent
  conference speaker on frontend architecture) — one practitioner's specific
  take, not community consensus, but well-reasoned and widely read.

- **Alex Kondov — Clean Architecture in React**
  https://alexkondov.com/full-stack-tao-clean-architecture-react/
  Companion piece generalizing the same decoupling argument (domain vs.
  infrastructure) beyond hooks specifically — cited for the framing
  "a React component should only render elements based on data and trigger
  events," which is the cleanest one-line summary of the presentational-
  component half of this pattern. Same authority tier as above.

- **Feature-Sliced Design — Overview / Slices and segments**
  (see above) — the `model` segment is FSD's formal answer to "where does
  business logic live, separate from UI": schemas, stores, and domain rules
  per slice, with `ui` segments forbidden from containing that logic
  directly.

- **bulletproof-react — Project Structure**
  (see above) — the `stores/` folder (global) and per-feature `stores/`
  give the escalation path once domain state needs to be shared across
  components/features rather than owned by one hook.

## Topic 6 — Barrel files, naming, colocating tests/styles, `lib`/`core` layer

- **bulletproof-react — Project Structure**
  (see above) — explicitly reversed earlier guidance: barrel files "can
  cause issues for Vite to do tree shaking and can lead to performance
  issues," now recommends direct imports over feature-wide `index.ts`
  barrels. Directly relevant since this repo's own vendored packages
  (`@devdigest/ui`, `@devdigest/shared`) *do* use barrel `index.ts` files —
  consistent with the "barrels are fine at a real package boundary" carve-out
  found across sources, not for internal app code.

- **"Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev
  Memory, and tsc" (2026)**
  https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm
  (mirrored at reactuse.com/blog/barrel-files-tree-shaking/) — concrete,
  measured example: a Next.js page importing one hook through a barrel
  pulled in a 552 kB client chunk, dropped to 64 kB after removing the
  barrel. Gives a hard rule of thumb: past ~20 re-exports, a barrel stops
  being a convenience and becomes a measurable perf bottleneck; also explains
  why *pure* barrels (only re-exports, no live code) can still be optimized
  by some tools while a barrel containing real exported values cannot.
  Authority: individual blog post, but reproduces a concrete, checkable
  before/after measurement rather than assertion — useful as the empirical
  backing for bulletproof-react's stated recommendation.

- **Airbnb React/JSX Style Guide**
  https://github.com/airbnb/javascript/tree/master/react
  Widely-adopted formal style guide: PascalCase filenames matching the
  component's reference name, one React component per file (multiple pure/
  stateless components tolerated in one file), `index.jsx`/`.tsx` as the
  convention for a directory's root component named after the directory.
  Authority: large-adoption formal style guide (basis for `eslint-config-
  airbnb`, used across thousands of codebases) — closest thing to an
  industry-standard naming reference for question 6.

- **Kent C. Dodds — Colocation**
  (see above) — same source answers the "colocating tests/styles" sub-
  question directly: tests and styles belong next to the component, not
  mirrored into parallel `__tests__/`/`styles/` trees; this is the direct
  justification for this repo's own `*.test.tsx`/`styles.ts` siblings
  convention.

- **bulletproof-react — Project Structure**
  (see above, again) — gives the concrete `lib/` vs `utils/` boundary that
  answers "when do you need a `lib/`/`core` layer": `lib/` exists
  specifically to hold *preconfigured* third-party dependencies (e.g. a
  configured HTTP client or date library instance) that would otherwise get
  reconfigured ad hoc in whichever file first needed them.

---

## Notes on source quality / what was excluded

- Excluded: generic SEO-farm "React folder structure" listicles that
  surfaced repeatedly in search results (Medium "Mastering React Folder
  Structures," GeeksforGeeks, most `dev.to` posts beyond the ones cited above)
  — thin restatements of bulletproof-react/Wieruch without independent
  reasoning.
- Frontend Mastery (frontendmastery.com) surfaced strong material on
  component *composition* (props/children layering, design-token → primitive
  → shared-library layering) but its most relevant posts are about
  composition patterns, which overlaps more with `react-best-practices`
  scope than this skill's file/folder scope — noted here but not deep-cited;
  worth a second pass if the skill later wants a composition-layering
  example (`https://frontendmastery.com/posts/advanced-react-component-composition-guide/`).
- patterns.dev, Josh Comeau's broader site, and Robin Wieruch's broader blog
  all have substantial component-pattern content (container/presentational,
  compound components, renderless components) that was intentionally
  under-cited here since it belongs to `react-best-practices`, not this
  skill.
- Could not fetch `profy.dev/article/react-folder-structure` (DNS failure at
  research time) — it kept surfacing in searches as a "type-based vs
  feature-based vs screaming architecture" comparison and may be worth a
  retry later; not relied upon for any claim above.
