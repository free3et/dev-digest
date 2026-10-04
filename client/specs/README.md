# client/specs

One file per UI feature: `NN-feature-name.md`. If it also needs a new endpoint,
put the spec in the root `../../specs/` so both sides stay in one document.

> **Base template:** the feature-spec shape in [`../../specs/README.md`](../../specs/README.md)
> (SPEC-NN, EARS acceptance criteria, provenance). The prompts below are
> client-specific prompts: cover them inside *Inputs and provenance*, the AC and
> *Edge cases* rather than as extra headings:

- **Route(s)** — src/app/**/page.tsx path
- **Data** — which hook in src/lib/hooks, which endpoint
- **States** — loading / empty / error / success
- **Copy** — keys to add under messages/<locale>/
