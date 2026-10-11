# Implementation Plan: Project Context — repository docs page with local edit

Spec: `specs/2026-10-05-project-context-docs.md` · Spec ID: SPEC-2026-10-05-project-context-docs · Spec status: approved · Mode: multi-agent · Packages: server (incl. `@devdigest/shared`), client, e2e

- **First:** T1 is a read-only check of what reads the clone working tree. Its stop-gate halts the run if a local `.md` edit could break indexing, review or sync.
- **Order:** contracts land before anything else. Server tests for the safe-write requirements AC-10…AC-14 are written failing before any server code; client Edit-mode tests (AC-13 UI, AC-15) are written failing before the editor.
- **Coverage:** every AC and NFR has at least one task and one test.

## 1. Context consulted

- **Specs:** this spec; sibling `specs/2026-10-05-project-context-attach.md` (1b). It consumes `doc_type`, `approx_tokens`, the document list (its `missing` flag) and the same safe read (its AC-9, AC-12, NFR-6).
- **`server/INSIGHTS.md`:**
  - Codebase Patterns 2026-10-05: the clone tree is the default branch; `readFile` follows symlinks, so a tree read needs its own `lstat`/`realpath` guard.
  - What Doesn't Work 2026-07-29: `*.it.test.ts` self-skip without Docker.
  - Recurring 2026-09-26: zod validation answers 422, not 400.
  - Recurring 2026-10-01: `test/reviews.it.test.ts` is flaky on a clean tree.
- **`client/INSIGHTS.md`:**
  - 2026-10-01: new i18n namespaces must be added to `src/test/render.tsx`.
  - 2026-09-20: nav items are spliced in `components/app-shell/nav.ts`, never in vendor.
  - 2026-09-19: `@devdigest/ui` `Textarea`/`Toggle` have no `id`/`aria-label`, so use native controls and `<label htmlFor>`.
  - 2026-09-19: a value import from shared breaks `next build`; check with `pnpm build`.
  - 2026-10-01: never run `pnpm build` while `next dev` is up.
  - 2026-09-26: no `user-event`, use `fireEvent`.
- **Root `INSIGHTS.md`** 2026-07-29: `client/src/vendor/shared` is a hand copy that already lags.
- **Code (`file:line`):**
  - `server/src/adapters/git/simple-git.ts:37-46` (`clonePathFor`), `:84-95` (`sync` = reset --hard), `:158-168` (`MAX_READ_AT_BYTES`, `isSafeRepoPath`)
  - `server/src/vendor/shared/contracts/platform.ts:254-269` (`SpecFile`, `IndexStatus`)
  - `server/src/platform/config.ts:86-88` (clone dir default `~/.devdigest/workspace`)
  - `server/src/app.ts:49` (bodyLimit 1 MiB)
  - `server/src/platform/errors.ts` (no 409 class yet)
  - `server/src/platform/container.ts:82-95` (overrides + `git` getter pattern)
  - `server/src/modules/_shared/context.ts:14` (`getContext`)
  - `server/test/indexer-walk.test.ts:29` (temp-dir unit-test precedent)
  - `client/src/lib/hooks/core.ts:122-137`
  - `client/src/components/app-shell/nav.ts`, `helpers.ts:30` (`/context` → `context`)
  - `client/src/vendor/ui/nav.ts:25` (WORKSPACE `pulls` item)
  - `client/src/app/repos/[repoId]/pulls/page.tsx:66` (`AppShell crumb` pattern)
  - `client/src/app/skills/_components/SkillDetail/_components/SkillPreviewTab/SkillPreviewTab.tsx:5-23` (react-markdown + remark-gfm, no rehype-raw)
  - `client/messages/en/context.json`, `client/src/test/render.tsx:19`
  - `client/src/lib/skills.ts:23` and `reviewer-core/src/prompt.ts:164` (`ceil(length/4)`)

## 2. Decisions from the review

- **Q1:** server tests for AC-10, AC-11, AC-12, AC-13, AC-14 are written failing first (wave 1A). Client tests for AC-13 (conflict UI) and AC-15 are written failing first (end of wave 1B) and implemented in wave 2B.
- **Q2:** search roots come from env `DEVDIGEST_CONTEXT_ROOTS`, a comma list of folder-segment names, default `specs,docs,insights`. Only names from the `doc_type` enum are allowed. The `.md` suffix is fixed; globs are not supported.
- **Q3:** `approx_tokens = Math.ceil(text.length / 4)` (UTF-16 code units), same as `estimateTokens` and reviewer-core.
- **Q4:** `cloned: false` ⇔ `repos.clone_path` is null **or** that directory does not exist.
- **Q5:** nav item in WORKSPACE right after `pulls`, key `context`, icon `FileText`, href `/repos/:repoId/context`, no `gKey`.
- **Q6:** a minimal e2e reachability flow is written in wave 3 and run only on the user's command.
- **R1:** "path is in the current document list" is a per-path check of O(depth), not a re-walk (see T15).
- **R2:** clone file access sits behind a new port `ContextDocStore` with container getter `contextDocs`. This is the hand-off to 1b.
- **R3:** the cap is enforced as UTF-8 bytes in the Zod refine; `PUT …/file` gets a route-level `bodyLimit` of 2 MiB.
- **R4:** the writer uses an injectable fs seam and a temp file in the same folder created with `wx`.
- **R5:** NFR-1 is a separate, opt-in timing test and does not gate the run.
- **R6:** every it-run first proves Docker is up and reports the skipped count.
- **R8:** only `contracts/platform.ts` is synced to the client vendor copy; `adapters.ts` is not.
- **R7 (done):** EC-8 traceability row, stray `;.` and the `server/clones` diagram label were fixed in the spec.
- **AC-11 vs the contract's "422 validation":** `ContextDocWrite.path` and the `?path=` query are plain non-empty strings in Zod. Every path rule returns 404 from the service, never 422. Only the content byte cap (AC-14) and missing or wrong-typed fields give 422.
- **Clone root:** `realpath(repos.clone_path)` from the workspace-scoped repo row. Tests point `clone_path` at a temp dir.

## 3. Architecture constraints

- **Onion (server):**
  - `routes.ts` is transport only: Zod params/query/body, `schema.response` declared on all three routes, one service call, map the result. It must not import `drizzle-orm`, `db/schema`, `node:fs` or an adapter class.
  - `service.ts` orchestrates and depends on the `ContextDocStore` **port**, not on `FsContextDocStore`.
  - Pure rules (root matching, `doc_type`, tokens, hash, sort) live in `helpers.ts`.
  - Drizzle only in `repository.ts`. FS I/O only in `src/adapters/context-docs/`.
  - New capability = port in `@devdigest/shared` `adapters.ts` → adapter → mock in `src/adapters/mocks.ts` → container getter and override.
  - No cross-module imports: the new module does its own workspace-scoped repo lookup in its own `repository.ts`, as `conventions` does, and does not import `repos/service`.
- **Fastify:** register one plugin statically in `src/modules/index.ts`. Errors are `AppError` subclasses so the shared handler maps them; add `ConflictError` (409) next to `NotFoundError`.
- **Zod:** contract first in `server/src/vendor/shared`, then the hand copy in the client. Wire fields are `snake_case`.
- **Frontend:**
  - the route page `app/repos/[repoId]/context/page.tsx` stays thin;
  - feature code lives in `_components/<PascalCase>/` folders with colocated `helpers.ts`/`constants.ts`/`styles.ts`/tests;
  - data access only through `src/lib/hooks/*` → `src/lib/api.ts`; server state stays in TanStack Query;
  - every string goes through the `context` i18n namespace, keys `camelCase` nested by section;
  - client code imports **types only** from `@devdigest/shared`;
  - no new barrels beyond a component's `index.ts`.
- **Do not touch:** `server/clones/**`, `client/src/vendor/ui/**`, migrations (none needed), lockfiles (no new dependency), `server/src/platform/{prompt,grounding,structured}.ts`, `reviewer-core/**` (1b's job).

## 4. Contract changes

- **`server/src/vendor/shared/contracts/platform.ts` (`@devdigest/shared`), first:**
  - add `ContextDocType` = enum `specs | docs | insights`;
  - add constant `CONTEXT_DOC_MAX_BYTES = 262_144`;
  - change `SpecFile`: add `doc_type: ContextDocType`, `approx_tokens: int ≥ 0`, `content_hash: string nullish`; keep `path`, `content`, `size`, `updated_at`;
  - new `ContextDocList { documents: SpecFile[], refreshed_at: string (ISO), cloned: boolean }`;
  - new `ContextDocWrite { path: string min 1, content: string refined to UTF-8 byte length ≤ CONTEXT_DOC_MAX_BYTES, base_hash: string min 1 }`;
  - new `ContextFileQuery { path: string min 1 }`.
- **`server/src/vendor/shared/adapters.ts`:** new port `ContextDocStore`, server-side only (R8), not synced to the client.
- **Client:** `client/src/vendor/shared/contracts/platform.ts` gets the same edit by hand; client code uses type imports only.
- **Migration:** none. Nothing is persisted.
- **Hand-off to 1b:**
  - 1b reuses `ContextDocType`, `CONTEXT_DOC_MAX_BYTES`, `SpecFile.approx_tokens`, the `container.contextDocs` port (`list` for `missing`, `resolve` plus `read` for the run-time safe read) and the `approxTokens` rule;
  - 1b adds `SpecFile.used_by_agents` itself;
  - 1b must not duplicate the guard.

## 5. Tasks

| # | Package | What to do | Files | Skills for implementer | AC | Test | Verification |
|---|---|---|---|---|---|---|---|
| T1 | server (read-only) | Verify that no reader of the clone working tree depends on `.md` content or on a clean tree. Check every `container.git.*` call; `repo-intel/pipeline/{walk,full,incremental}.ts`; `adapters/astgrep/index.ts:621`; `adapters/codeindex/ripgrep.ts` (`grepWithNode` reads every walked file); `repo-intel/service.ts` `readClone` callers; conventions; onboarding; smart-diff; anything running `reset/clean/stash/checkout/status`. Also confirm a temp file named `.<name>.<rand>.tmp` is ignored by all of them. Output a findings list with `file:line`, classified *harmless* / *blocking*. **Stop-gate:** any *blocking* finding (a local `.md` edit or a dirty tree changes indexing, review input or sync failure behaviour) → stop the run, no further waves; the main session reports to the user (spec/plan revision). Only *harmless* findings → copy them into §9 and continue. | none (read-only) | `onion-architecture`, `engineering-insights` | support | — (report) | Findings report; reviewed by the main session before T2 |
| T2 | server (`@devdigest/shared`) | Contract changes per §4 in `contracts/platform.ts`. Extend `test/contracts.test.ts`: the byte refine rejects 262 145 ASCII bytes and 65 537 × "€" (3 bytes each), and accepts exactly 262 144 bytes. | `server/src/vendor/shared/contracts/platform.ts`, `server/test/contracts.test.ts` | `onion-architecture`, `zod` | AC-2, AC-14 (support) | unit `contracts.test.ts` | `scripts/check-pkg.sh server server/src/vendor/shared/contracts/platform.ts server/test/contracts.test.ts` |
| T3 | server (`@devdigest/shared`) | Port `ContextDocStore` in `adapters.ts`. Methods: `list(root, roots): Promise<ContextDocEntry[]>` with entry = `{ path, size, mtime, text }`, regular non-symlink files only, symlinked dirs not descended, `node_modules`/`.git`/`vendor` dirs pruned, all other dot-dirs walked. `resolve(root, path, roots): Promise<string \| null>` (the R1 predicate). `read(abs): Promise<Buffer>`. `writeAtomic(abs, content): Promise<void>`. | `server/src/vendor/shared/adapters.ts` | `onion-architecture`, `typescript-expert` | AC-1, AC-11, AC-12 (support) | covered by T6 | `scripts/check-pkg.sh server server/src/vendor/shared/adapters.ts` |
| T4 | client | Hand-sync `contracts/platform.ts` from the server copy (only this file). Confirm with `diff` that the Project Context block is identical. | `client/src/vendor/shared/contracts/platform.ts` | `zod` | support | — | `diff <(sed -n '/Project Context/,/Run request/p' server/src/vendor/shared/contracts/platform.ts) <(sed -n '/Project Context/,/Run request/p' client/src/vendor/shared/contracts/platform.ts)` empty; `scripts/check-pkg.sh client` |
| T5 | server (test-writer) | **Failing route tests first.** New `test/project-context.it.test.ts`. Fixture: a temp-dir clone and a repo row in workspace W with `clone_path` = that dir. Contains `docs/a.md`, `specs/b.md`, `docs/specs/c.md`, `.devdigest/specs/d.md`, `node_modules/docs/x.md`, `vendor/docs/y.md`, a symlinked `docs/link.md` → outside file, a symlinked folder `docs/out` → outside dir with `z.md`, and `src/readme.md` (no root). **AC-1:** exact listed path set. **AC-2:** `doc_type` / `approx_tokens` values incl. `docs/specs/c.md → specs` and a non-ASCII file (`size` = bytes, tokens = `ceil(length/4)`). **AC-3:** `clone_path` null and dir missing → `cloned:false, documents:[]`. **AC-10:** PUT then GET (bytes on disk equal body; new `content_hash` ≠ old). **AC-11:** one case each for not-listed, absolute, `..`, `\`, NUL, `.git/config`, symlink leaf, file inside symlinked folder; GET and PUT both 404; outside targets byte-identical afterwards. **AC-13:** stale `base_hash` → 409, file unchanged. **AC-14:** 262 145 bytes → 422, unchanged; plus 262 144 bytes of `\u0001` (≈1.5 MiB JSON) → 200, proving R3 gives no 413. **NFR-2:** repo of another workspace → 404 on all three routes. **NFR-4:** PUT writes exactly one log line with repo id, path and new size and no content (capture via a pino stream on the test app). | `server/test/project-context.it.test.ts` | `onion-architecture`, `fastify-best-practices`, `security` | AC-1, AC-2, AC-3, AC-10, AC-11, AC-13, AC-14, NFR-2, NFR-4 | integration `*.it.test.ts` | Docker check (§7), then `cd server && pnpm exec vitest run project-context.it` → fails for missing routes, not for fixture errors |
| T6 | server (test-writer) | **Failing adapter and helper tests first.** `test/project-context-store.test.ts` (temp dir, precedent `indexer-walk.test.ts`): `list` pruning and symlink rules (AC-1); `resolve` returns null for each AC-11 kind incl. symlinked ancestor and a real path outside root; `writeAtomic` with an injected `rename` that throws leaves the original bytes unchanged and no `*.tmp` in the folder (AC-12); happy path replaces the content (AC-10). `test/project-context-helpers.test.ts`: `docTypeFor` deepest segment, `approxTokens` on ASCII, CJK and emoji, `isCandidatePath`, `parseContextRoots` (default, subset, unknown name rejected). Seams: `new FsContextDocStore({ rename?, writeFile?, unlink? })` in `server/src/adapters/context-docs/fs-store.ts`; helpers in `server/src/modules/project-context/helpers.ts`. | `server/test/project-context-store.test.ts`, `server/test/project-context-helpers.test.ts` | `onion-architecture`, `security` | AC-1, AC-2, AC-10, AC-11, AC-12 | unit | `scripts/check-pkg.sh server --no-typecheck server/test/project-context-store.test.ts server/test/project-context-helpers.test.ts` → failing on missing modules only |
| T7 | client | Hooks: `useContextFiles` → `ContextDocList` (same key `["context", repoId]`). New `useContextFile(repoId, path)` (key `["context-file", repoId, path]`, `?path=` URL-encoded). New `useSaveContextFile(repoId)`: PUT; on success sets the file query and invalidates `["context", repoId]`. Leave `useReindexContext` untouched and unwired. | `client/src/lib/hooks/core.ts`, `client/src/lib/hooks/core.test.ts` (or the existing hook test file if present) | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library` | AC-7, AC-10 (support) | unit (hook with mocked fetch) | `scripts/check-pkg.sh client client/src/lib/hooks/core.ts` |
| T8 | client | Nav and route: `registerContextNav()` in `nav.ts` splices `{key:"context", label:"Project Context", icon:"FileText", href:"/repos/:repoId/context"}` into WORKSPACE right after `pulls`, idempotently. Thin `page.tsx` renders `AppShell crumb={[{label: repoName, mono:true},{label: t("breadcrumb")}]}` and `ContextView`. Add the route to `client/README.md`'s route map. | `client/src/components/app-shell/nav.ts`, `client/src/components/app-shell/nav.test.ts`, `client/src/app/repos/[repoId]/context/page.tsx`, `client/README.md` | `frontend-ui-architecture`, `next-best-practices`, `react-testing-library` | AC-4 | unit (nav entry position, href, idempotent) + RTL (crumb text `<owner>/<name>` and `Project Context`) | `scripts/check-pkg.sh client client/src/components/app-shell/nav.ts` |
| T9 | client | `ContextView` (list pane): rows sorted as received, each showing file name, folder, a type badge with text, `≈ N tok`, an ellipsis cell with `title` = full path, rows as buttons. Footer `N documents · ≈ X tokens total · refreshed <relative>` (pure `footerTotals` + relative time helper; reuse `src/lib/format.ts` if it has one). Refresh button with accessible name. States: loading; not cloned (AC-3); list error + Retry; empty state naming the roots from i18n. | `client/src/app/repos/[repoId]/context/_components/ContextView/{ContextView.tsx,index.ts,helpers.ts,constants.ts,styles.ts,ContextView.test.tsx,helpers.test.ts}`, `…/ContextView/DocList/…` | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library` | AC-3, AC-5, AC-6, AC-7, AC-9, NFR-3 | RTL (order, badge text, `≈ N tok`, `title`, footer for 3-doc fixture, second fetch replaces footer, not-cloned text, error + Retry refetches, empty state; role/name queries for Refresh/Retry/rows) + unit helpers | `scripts/check-pkg.sh client <files>` |
| T10 | client | `DocPanel` Preview: Preview/Edit toggle as native buttons with `aria-pressed`. Markdown via `react-markdown` + `remark-gfm`, **no** `rehype-raw`, no `dangerouslySetInnerHTML`. File error + Retry. Copy the `MD_COMPONENTS` idea from SkillPreviewTab locally, not a cross-route import. | `client/src/app/repos/[repoId]/context/_components/ContextView/DocPanel/{DocPanel.tsx,index.ts,constants.tsx,styles.ts,DocPanel.test.tsx}` | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library` | AC-8, AC-9, NFR-3 | RTL: heading rendered; content with `<script>` and `<img src=x onerror=…>` produces no `script`/`img` element; file error + Retry | `scripts/check-pkg.sh client <files>` |
| T11 | client | i18n: rewrite `messages/en/context.json` into nested sections (`breadcrumb`, `list.*`, `footer.*`, `states.*`, `panel.*`, `editor.*`), with ICU plural for the document count. Drop chunk/reindex keys only if nothing references them (`rg` first). Register `context` in `src/test/render.tsx`. | `client/messages/en/context.json`, `client/src/test/render.tsx` | `frontend-ui-architecture` | support (D-1 gap G14) | through T8–T12 RTL | `scripts/check-pkg.sh client` |
| T12 | client | **Failing Edit-mode tests first**, added to `DocPanel.test.tsx` and marked as the wave 2B target. Cover: banner text "Local edit only — not committed. A repository resync overwrites it."; `unsaved` badge appears on change and disappears when the text equals the loaded content; Discard restores; Save sends `{path, content, base_hash}`; 409 shows the conflict message + Reload, and Reload refetches and leaves Edit with fresh content; the textarea has a label; Save/Discard/Reload reachable by role/name. | `…/DocPanel/DocPanel.test.tsx` | `react-testing-library` | AC-13, AC-15, NFR-3 | RTL (failing) | `scripts/check-pkg.sh client --no-typecheck …/DocPanel/DocPanel.test.tsx` → only the Edit tests fail |
| T13 | server | Config: `DEVDIGEST_CONTEXT_ROOTS` in `platform/config.ts` → `contextRoots: string[]` via `parseContextRoots` (from T14). Empty or unknown name → `ConfigError` at boot. Document it in `server/README.md` env table. | `server/src/platform/config.ts`, `server/README.md` | `onion-architecture`, `zod` | AC-1 (support) | unit `project-context-helpers.test.ts` (T6) | `scripts/check-pkg.sh server server/src/platform/config.ts` |
| T14 | server | Pure helpers and constants in the new module: `EXCLUDED_SEGMENTS`, `DEFAULT_CONTEXT_ROOTS`, `parseContextRoots`, `isCandidatePath(path, roots)` (`isSafeRepoPath` is pure, so importing it from `adapters/git/simple-git.ts` is allowed; prefer the import), `docTypeFor`, `approxTokens`, `contentHash` (sha256 hex of bytes via `node:crypto`), `toSpecFile(entry, roots, {withContent})`, path sort with plain code-unit compare. | `server/src/modules/project-context/{helpers.ts,constants.ts}` | `onion-architecture` | AC-1, AC-2 | unit T6 helpers (turns green) | `scripts/check-pkg.sh server server/src/modules/project-context/helpers.ts` |
| T15 | server | Adapter `FsContextDocStore` (ring 3) per T3. `list`: iterative `readdir(withFileTypes)`; never `stat`-follow; prune excluded and symlinked dirs; keep regular `.md` files that pass `isCandidatePath`; read text once for tokens. `resolve`: `isCandidatePath` → `lstat` each ancestor (real dir) and the leaf (regular file) → `realpath(leaf)` starts with `realpath(root)+sep` → absolute path, else null. `writeAtomic`: `writeFile(tmp, content, {flag:'wx'})` in the target's folder (name `.<base>.<random>.tmp`) → `rename(tmp, abs)`; on any error `unlink(tmp)` best-effort and rethrow. Add `MockContextDocStore` (in-memory map) to `mocks.ts`, plus getter `contextDocs` and override key in `container.ts`. | `server/src/adapters/context-docs/fs-store.ts`, `server/src/adapters/mocks.ts`, `server/src/platform/container.ts` | `onion-architecture`, `security` | AC-1, AC-10, AC-11, AC-12 | unit T6 store tests (green) | `scripts/check-pkg.sh server server/src/adapters/context-docs/fs-store.ts server/test/project-context-store.test.ts` |
| T16 | server | `repository.ts`: `getRepoForWorkspace(workspaceId, id)` → `{id, clonePath}`. `service.ts` (`ProjectContextService`): `list(ws, id)`: repo missing → `NotFoundError`; no clone (Q4) → `{cloned:false, documents:[], refreshed_at}`; else `store.list` → `toSpecFile` without content, sorted. `readFile(ws, id, path)`: `resolve` null → `NotFoundError('path not in the document list')`; else read → `SpecFile` with content and hash. `writeFile(ws, id, body)`: resolve (404) → read current → hash ≠ `base_hash` → `ConflictError('content changed since loaded')` → `writeAtomic` → re-read → `SpecFile`. Add `ConflictError` (409, code `conflict`) to `platform/errors.ts`. Hermetic `service.test.ts` with `MockContextDocStore`. | `server/src/modules/project-context/{repository.ts,service.ts}`, `server/src/platform/errors.ts`, `server/test/project-context-service.test.ts` | `onion-architecture`, `drizzle-orm-patterns` | AC-3, AC-10, AC-11, AC-13, NFR-2 | unit (service + mock store); integration T5 | `scripts/check-pkg.sh server server/src/modules/project-context/service.ts server/test/project-context-service.test.ts` |
| T17 | server | `routes.ts`: `GET /repos/:id/context` → `ContextDocList`; `GET /repos/:id/context/file` (querystring `ContextFileQuery`) → `SpecFile`; `PUT /repos/:id/context/file` (body `ContextDocWrite`, `bodyLimit: 2 * 1024 * 1024`) → `SpecFile`. Each declares `schema.response`. After a successful PUT: `req.log.info({repo_id, path, size}, 'project context doc saved')`, never the content. Register in `modules/index.ts` (one import + one entry). Add the routes to `server/README.md`'s API map. | `server/src/modules/project-context/routes.ts`, `server/src/modules/index.ts`, `server/README.md` | `onion-architecture`, `fastify-best-practices`, `zod`, `security` | AC-1, AC-2, AC-3, AC-10, AC-11, AC-13, AC-14, NFR-2, NFR-4 | integration T5 (green); `test/routes-smoke.test.ts` gains one 422 case (`PUT` without `base_hash`) | `scripts/check-pkg.sh server`; then the it-run per §7: every case in `project-context.it.test.ts` passes with 0 skipped |
| T18 | server | NFR-1 timing: `test/project-context-perf.it.test.ts`, run only when `DEVDIGEST_PERF=1`. Generate 20 000 files including 500 matching `.md`, warm up 3 requests, measure 20 `GET /repos/:id/context`, print p95, assert ≤ 500 ms. Non-gating (R5): the main session runs it once and records the number in the PR. | `server/test/project-context-perf.it.test.ts` | `onion-architecture`, `fastify-best-practices` | NFR-1 | integration timing | `cd server && DEVDIGEST_PERF=1 pnpm exec vitest run project-context-perf` |
| T19 | client | Edit mode in `DocPanel`: native `<textarea>` with `<label htmlFor>` (`useId`); draft state seeded from the loaded content; `unsaved` badge when `draft !== content`; banner; Save via `useSaveContextFile` with `base_hash = content_hash`; Discard resets the draft; on a 409 `ApiError` show the inline conflict message + Reload (refetch file, reset draft); other errors inline. Pure `isDirty`/`isConflict` in `helpers.ts`. | `…/DocPanel/{DocPanel.tsx,helpers.ts,helpers.test.ts,constants.tsx,styles.ts}` | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library` | AC-10, AC-13, AC-15, NFR-3 | RTL T12 (green) + unit helpers | `scripts/check-pkg.sh client <files>` |
| T20 | client | Build check for the value-import trap. Stop `next dev` first. | — | `next-best-practices` | support | — | `cd client && pnpm build` passes; `rg "from \"@devdigest/shared\"" client/src/app/repos/\[repoId\]/context client/src/lib/hooks/core.ts` shows only `import type` |
| T21 | e2e | Minimal flow `e2e/specs/08-project-context.flow.json`: open the seeded repo, click sidebar "Project Context", assert the URL ends with `/context` and the page shows either the list or the not-cloned state. LLM-free. **Do not run** unless the user says. | `e2e/specs/08-project-context.flow.json` (+ `e2e/README.md` flow list if it enumerates flows) | `onion-architecture` | AC-4 | e2e (flow) | `cd e2e && npm run typecheck`; `npm run e2e:hermetic` only on user command |

Checklist form:

- [ ] T1 Verify the clone working-tree readers; stop-gate → support → findings report
- [ ] T2 `@devdigest/shared` contracts (`SpecFile`+, `ContextDocList`, `ContextDocWrite`, byte cap) → AC-2, AC-14 (support) → `server/test/contracts.test.ts`
- [ ] T3 `ContextDocStore` port → AC-1, AC-11, AC-12 (support) → T6 tests
- [ ] T4 Client vendor sync of `contracts/platform.ts` → support → diff + client typecheck
- [ ] T5 Failing route tests → AC-1, AC-2, AC-3, AC-10, AC-11, AC-13, AC-14, NFR-2, NFR-4 → `server/test/project-context.it.test.ts`
- [ ] T6 Failing store and helper tests → AC-1, AC-2, AC-10, AC-11, AC-12 → `server/test/project-context-store.test.ts`, `server/test/project-context-helpers.test.ts`
- [ ] T7 Client hooks → AC-7, AC-10 (support) → hook test
- [ ] T8 Nav item and route page → AC-4 → `nav.test.ts` + crumb RTL
- [ ] T9 List, footer, refresh, states → AC-3, AC-5, AC-6, AC-7, AC-9, NFR-3 → `ContextView.test.tsx`, `helpers.test.ts`
- [ ] T10 Preview (markdown, raw HTML inert) → AC-8, AC-9, NFR-3 → `DocPanel.test.tsx`
- [ ] T11 i18n `context` namespace + test registration → support → via T8–T12
- [ ] T12 Failing Edit-mode tests → AC-13, AC-15, NFR-3 → `DocPanel.test.tsx`
- [ ] T13 `DEVDIGEST_CONTEXT_ROOTS` config → AC-1 (support) → helpers unit
- [ ] T14 Pure helpers → AC-1, AC-2 → `project-context-helpers.test.ts`
- [ ] T15 `FsContextDocStore` + mock + container → AC-1, AC-10, AC-11, AC-12 → `project-context-store.test.ts`
- [ ] T16 Repository, service, `ConflictError` → AC-3, AC-10, AC-11, AC-13, NFR-2 → `project-context-service.test.ts` + T5
- [ ] T17 Routes + registration + log line → AC-1, AC-2, AC-3, AC-10, AC-11, AC-13, AC-14, NFR-2, NFR-4 → T5 + `routes-smoke.test.ts`
- [ ] T18 NFR-1 timing test → NFR-1 → `project-context-perf.it.test.ts`
- [ ] T19 Edit mode → AC-10, AC-13, AC-15, NFR-3 → `DocPanel.test.tsx`
- [ ] T20 `pnpm build` value-import check → support → build
- [ ] T21 e2e reachability flow → AC-4 → `e2e/specs/08-project-context.flow.json`

## 6. Execution (multi-agent)

- **Baseline:** the main session runs `scripts/check-all.sh` before wave 0 and passes the result to every agent.
- **Wave 0, one `implementer` (server package; T4 touches client only after T2):**
  - T1 → **gate:** the main session reads the T1 report. If anything is *blocking*, stop and go to the user.
  - T2 → T3 → T4. Then `scripts/check-all.sh`.
- **Wave 1, two agents in parallel:**
  - **1A `test-writer` (server only):** T5, T6. Must not create anything under `server/src/`. Its tests target the seams fixed in T5/T6/T15/T16/T17.
  - **1B `implementer` (client only):** T11 → T7 → T8 → T9 → T10 → T12 (T12 last, left failing on purpose).
  - Then `scripts/check-all.sh`. Expected failures: the T6 server tests and the T12 Edit tests. The main session confirms they fail for "not implemented" reasons only.
- **Wave 2, two `implementer`s in parallel:**
  - **2A (server only):** T13 → T14 → T15 → T16 → T17 → T18. Wave 1A's tests must turn green without being weakened. Changing an assertion requires a one-line reason in the report.
  - **2B (client only):** T19 → T20.
  - Then `scripts/check-all.sh` (all green), plus the server it-run per §7.
- **Wave 3, one `implementer` (e2e only):** T21. Written, not run.
- **Wave 4, reviewers:**
  - `test-writer` gap pass, both packages, only where the matrix shows a thin test;
  - `architecture-reviewer` on `scripts/review-input.sh` output;
  - `plan-verifier` against §8.
- **Agents:** 5 implementer/test-writer runs plus 3 review runs. Each parallel agent runs `scripts/check-pkg.sh` for its own package only.

## 7. Test plan

- **Per task:** `scripts/check-pkg.sh <server|client> <changed files>`.
- **Per package, at the end of its wave:** `scripts/check-pkg.sh server` and `scripts/check-pkg.sh client`. The main session runs `scripts/check-all.sh` at baseline and after each wave.
- **Server integration (Docker required):**
  1. Run `docker info >/dev/null && echo docker-ok`. Without `docker-ok`, the it-results are invalid.
  2. Run `cd server && pnpm exec vitest run project-context`.
  3. Report the pass and skip counts. **0 skipped** is required.
  - No LLM is involved, so the empty-`HOME` trick is not needed.
  - Do not run the whole `.it.test` lane as the gate: `reviews.it.test.ts` is flaky on a clean tree.
- **Client:** `pnpm` only. RTL uses `fireEvent`. Run `pnpm build` once with dev stopped (T20).
- **e2e:** `npm` only, typecheck only, unless the user asks for the run.
- **Package managers:** `pnpm` in `server/` and `client/`, `npm` in `e2e/`.

## 8. Coverage matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 | T3, T5, T6, T13, T14, T15, T17 | `project-context.it.test.ts`, `project-context-store.test.ts`, `project-context-helpers.test.ts` | |
| AC-2 | T2, T5, T6, T14, T17 | `project-context-helpers.test.ts`, `project-context.it.test.ts` | |
| AC-3 | T5, T9, T16, T17 | `project-context.it.test.ts`, `ContextView.test.tsx` | |
| AC-4 | T8, T21 | `nav.test.ts`, page crumb RTL, `08-project-context.flow.json` | |
| AC-5 | T9 | `ContextView.test.tsx` | |
| AC-6 | T9 | `ContextView.test.tsx`, `ContextView/helpers.test.ts` | |
| AC-7 | T7, T9 | `ContextView.test.tsx`, hook test | |
| AC-8 | T10 | `DocPanel.test.tsx` | |
| AC-9 | T9, T10 | `ContextView.test.tsx`, `DocPanel.test.tsx` | |
| AC-10 | T5, T6, T15, T16, T17, T19 | `project-context.it.test.ts`, `project-context-store.test.ts`, `DocPanel.test.tsx` | |
| AC-11 | T5, T6, T15, T16, T17 | `project-context.it.test.ts`, `project-context-store.test.ts` | |
| AC-12 | T6, T15 | `project-context-store.test.ts` | |
| AC-13 | T5, T12, T16, T17, T19 | `project-context.it.test.ts`, `project-context-service.test.ts`, `DocPanel.test.tsx` | |
| AC-14 | T2, T5, T17 | `contracts.test.ts`, `project-context.it.test.ts`, `routes-smoke.test.ts` | |
| AC-15 | T12, T19 | `DocPanel.test.tsx` | |
| NFR-1 | T18 | `project-context-perf.it.test.ts` (opt-in) | |
| NFR-2 | T5, T16, T17 | `project-context.it.test.ts` | |
| NFR-3 | T9, T10, T12, T19 | `ContextView.test.tsx`, `DocPanel.test.tsx` (role/name queries) | |
| NFR-4 | T5, T17 | `project-context.it.test.ts` (log capture) | |

## 9. Risks and known traps

- **T1 stop-gate:** the whole safe-write estimate assumes the clone is read-only for everyone else. Known *harmless* reader so far: `grepWithNode` reads every walked file (`server/src/adapters/codeindex/ripgrep.ts:83-92`), so fallback grep sees local edits.
- **Resync wipes edits (EC-7, accepted):** `sync` = `reset --hard` (`simple-git.ts:84-95`), triggered only by an explicit resync job (`repo-intel/routes.ts:53`, `service.ts:152`). The banner (AC-15) is the only mitigation.
- **TOCTOU between `resolve` and `rename` (accepted, C-6):** a folder swapped for a symlink in between. `rename` replaces a leaf symlink rather than following it, and the temp file is created `wx` in the resolved folder. Two concurrent PUTs can both pass the hash check; the last one wins.
- **Docker-less it-runs report green** with everything skipped (server INSIGHTS 2026-07-29). §7 requires the Docker check and 0 skipped.
- **422 vs 404:** a regex on `path` in Zod would turn AC-11 cases into 422. Keep `path` a plain string. Validation failures are 422 in this app (server INSIGHTS 2026-09-26).
- **Body limit:** without the route-level 2 MiB `bodyLimit`, escape-heavy content returns 413, not 422 (`app.ts:49`).
- **Byte cap vs `.max()`:** Zod `.max()` counts UTF-16 units. The refine must use UTF-8 bytes.
- **Contract drift:** `client/src/vendor/shared` is a hand copy (root INSIGHTS 2026-07-29). T4 diff-checks the Project Context block.
- **Client value import from shared** breaks `next build` (client INSIGHTS 2026-09-19). Use type imports and the T20 build. Never build while `next dev` runs (client INSIGHTS 2026-10-01).
- **i18n namespace** not registered in `src/test/render.tsx` → missing-message errors in RTL (client INSIGHTS 2026-10-01).
- **`@devdigest/ui` `Textarea`/`Toggle` cannot be labelled** (client INSIGHTS 2026-09-19). Use native controls for NFR-3.
- **AC-8 depends on react-markdown 9's default handling of raw HTML.** If the test shows raw HTML is dropped rather than shown as text, that still satisfies "never executed or rendered as elements". If the user wants it visible as text, that is a spec question for `spec-creator`, not a plan change.
- **NFR-1 timing is machine-dependent.** It is opt-in and non-gating (R5).
- **Clone dir:** the default is `~/.devdigest/workspace`, not `server/clones` (`config.ts:86-88`). Tests use `clone_path` temp dirs, so neither is touched.
- **Parallel waves share one working tree:** agents must stay inside their own package. `scripts/check-pkg.sh` is per package; only the main session runs `check-all.sh`.

## 10. Handoff

- **Do not touch:** `server/clones/**`; `client/src/vendor/ui/**`; `client/src/vendor/shared/adapters.ts` (R8); migrations (none needed) and lockfiles (no new dependency); `reviewer-core/**`; `useReindexContext` / `IndexStatus` (stay unwired); `server/src/platform/{prompt,grounding,structured}.ts`.
- **For `architecture-reviewer`:**
  - the port → adapter → mock → container chain for `ContextDocStore`;
  - no `node:fs`/Drizzle in `routes.ts` or `service.ts`;
  - `schema.response` on all three routes;
  - no cross-module import (the module does its own repo lookup);
  - client import direction and the type-only shared imports.
- **For security review (no agent; the main session or `/security-review`):**
  - `resolve` (ancestor `lstat`, `realpath` containment);
  - `writeAtomic` cleanup;
  - PUT log line has no content;
  - Markdown preview has no `rehype-raw`;
  - workspace scoping on all three routes.
- **For 1b:** reuse `container.contextDocs` (`list`, `resolve`, `read`), `ContextDocType`, `CONTEXT_DOC_MAX_BYTES` and `approxTokens` (`ceil(length/4)`). 1b adds `SpecFile.used_by_agents` and its own routes.
- **Open after this plan:** the e2e run (on user command).
- **Possible INSIGHTS entry, once T1 confirms it:** the ripgrep fallback `grepWithNode` reads every walked file regardless of extension (`server/src/adapters/codeindex/ripgrep.ts:83-92`), unlike the code-only repo-intel walk. Also: the clone dir defaults to `~/.devdigest/workspace`, not `server/clones/` as `server/CLAUDE.md` claims.
