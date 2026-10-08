# reviewer-core/specs

One file per engine change: `YYYY-MM-DD-<slug>.md` (Spec ID `SPEC-YYYY-MM-DD-<slug>`; template and rules in [`../../specs/README.md`](../../specs/README.md)).

> **Base template:** the feature-spec shape in [`../../specs/README.md`](../../specs/README.md)
> (EARS acceptance criteria, provenance). The prompts below are
> reviewer-core-specific: cover them inside *Inputs and provenance*, the AC and
> *Edge cases* rather than as extra headings:

- **Prompt slots** — new/changed section in assemblePrompt
- **Public API** — what src/index.ts starts exporting; who consumes it
- **Grounding impact** — does this change what survives the gate?
- **Determinism** — must stay reproducible under a stubbed LLMProvider

Two constraints every spec here must respect: the package stays **pure** (no DB,
GitHub, or filesystem), and the **grounding gate keeps its veto**. A spec that
needs either broken belongs in `../../server/specs/` instead.
