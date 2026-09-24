# frontend-ui-architecture

Version **1.0.0** · scope: React + Next.js App Router **architecture and file
organization** (not performance, not component internals).

The skill itself is [SKILL.md](SKILL.md). Annotated research notes (why each
source was chosen, what it says, its authority) are in [SOURCES.md](SOURCES.md).
Component internals live in `.claude/skills/react-best-practices/`.

## Questions the skill answers

Where components live · how to split them · where constants go · utils vs helpers
vs hooks vs services · where business logic lives · barrel files, naming,
colocated tests/styles, when to add `lib/`.

## Sources used

### Structure & Next.js App Router
- bulletproof-react — Project Structure: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Next.js — Project structure and organization: https://nextjs.org/docs/app/getting-started/project-structure
- Feature-Sliced Design — Overview: https://feature-sliced.design/docs/get-started/overview
- Feature-Sliced Design — Slices and segments: https://feature-sliced.design/docs/reference/slices-segments
- Robin Wieruch — React Folder Structure Best Practices [2026]: https://www.robinwieruch.de/react-folder-structure/
- Next.js colocation template (illustration only): https://github.com/arhamkhnz/next-colocation-template

### Splitting components & colocation
- Josh W. Comeau — Delightful React File/Directory Structure: https://www.joshwcomeau.com/react/file-structure/
- Kent C. Dodds — Colocation: https://kentcdodds.com/blog/colocation

### Logic separation (hooks, utils, services, domain)
- Felix Gerschau — Separation of concerns with React hooks: https://felixgerschau.com/react-hooks-separation-of-concerns/
- Alex Kondov — Hexagonal-Inspired Architecture in React: https://alexkondov.com/hexagonal-inspired-architecture-in-react/
- Alex Kondov — Clean Architecture in React: https://alexkondov.com/full-stack-tao-clean-architecture-react/
- utils vs helpers discussion (illustrative): https://github.com/erikras/react-redux-universal-hot-example/issues/808

### Barrels, naming
- Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026): https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm
- Airbnb React/JSX Style Guide: https://github.com/airbnb/javascript/tree/master/react

### Noted, not deeply cited
- Frontend Mastery — advanced component composition (composition layering, overlaps `react-best-practices`): https://frontendmastery.com/posts/advanced-react-component-composition-guide/
- profy.dev — React folder structure (not fetched at research time, not relied upon): https://profy.dev/article/react-folder-structure

## Repo grounding

The skill encodes this repo's existing convention (root `CLAUDE.md`,
`client/README.md`): PascalCase folder per component with colocated
`styles.ts` / `constants.ts` / `helpers.ts` / `*.test.tsx`, route-colocated
`_components/`, shared components in `client/src/components/`, all API access via
`src/lib/hooks/*` → `src/lib/api.ts`. Sources were used to justify and sharpen
that shape, not to change it.

## Changelog

- **1.0.0** — initial skill distilled from SOURCES.md.
