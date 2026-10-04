# server/specs

One file per server-side feature: `NN-feature-name.md`. Anything that also
changes the UI belongs in the root `../../specs/` instead.

> **Base template:** the feature-spec shape in [`../../specs/README.md`](../../specs/README.md)
> (SPEC-NN, EARS acceptance criteria, provenance). The prompts below are
> server-specific prompts: cover them inside *Inputs and provenance*, the AC and
> *Edge cases* rather than as extra headings:

- **Routes** — method + path + which @devdigest/shared schema
- **Schema changes** — tables/columns; remember: db:generate, never hand-write
- **Adapters needed** — new port behind the DI container?

Most course lessons land as a new `src/modules/<name>/` plugin — say which
module the spec creates or extends.
