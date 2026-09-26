# Deterministic checks

Run from the repo root. `BASE` = `base_sha` from the collector. Only run what the
collector's `checks`/`packages` list; report the command and the outcome.

## Typecheck and tests (per touched package)

```bash
( cd server        && pnpm typecheck && pnpm test )
( cd client        && pnpm typecheck && pnpm test )
( cd reviewer-core && npm run typecheck && npm test )
( cd e2e           && npm run typecheck )      # flows need a running app: do not run them
```

- `server` `pnpm test` includes `*.it.test.ts` (testcontainers Postgres). If Docker is
  not running, report "integration tests not run: Docker unavailable" — that is not a
  pass and not a critical; say the verdict is unverified for DB-backed behavior.
- Capture the last ~40 lines of output as evidence.

## `schema-needs-migration`

Triggered when `server/src/db/schema/**` (or `db/rows.ts`) changed.

1. `git diff -U0 BASE -- server/src/db/schema` — look for added/removed/renamed
   tables, columns, indexes, constraints or defaults (ignore comments and types-only
   TS changes).
2. If there are such changes and the diff adds **no** new `server/src/db/migrations/*.sql`
   → `critical`: "schema changed without a migration; fresh databases fail" (this
   exact drift caused `column "cost_usd" does not exist`).
3. Do **not** run `pnpm db:generate` to check — it writes files. Tell the user to run
   it and expect a new migration, then `pnpm db:migrate`.

## `migration-hygiene`

- A **modified** existing migration (`git diff --name-status BASE -- server/src/db/migrations`
  shows `M` on a `.sql`) → `critical` (migrations are append-only; root `CLAUDE.md`).
- New `.sql` without a matching entry in `meta/_journal.json` and a `meta/*_snapshot.json`
  (`git diff --name-only BASE -- server/src/db/migrations/meta`) → `critical`.
- `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` without `WHERE` in a new
  migration → `critical` (data loss); the user may waive if intended.
- `ADD COLUMN ... NOT NULL` without a default on an existing table → `major`.
- Hand-written migration (no drizzle-generated name/snapshot) → `major`.

## `contract-sync`

`server/src/vendor/shared/**` is the source of truth; `client/src/vendor/shared/**` is a
hand copy that already differs in places (root `INSIGHTS.md`).

- For each changed file present in both trees, compare the changed hunks:
  `diff <(git show BASE:server/src/vendor/shared/X) server/src/vendor/shared/X` vs the
  same for the client. Different edits → `major` ("copies diverged").
- A server-only change is legitimate only if the client still typechecks; if the client
  typecheck fails, that failure is the `critical`.
- A change in `client/src/vendor/shared/**` that is absent from the server copy →
  `major` ("contracts change in `@devdigest/shared` first").

## `secrets-scan`

Scan **added lines only**, for tracked and untracked files. `.claude/skills/**` is excluded
because the patterns below would match their own documentation:

```bash
{ git diff -U0 --no-color BASE -- . ':!.claude/skills'
  for f in $(git ls-files --others --exclude-standard | grep -v '^\.claude/skills/'); do
    grep -Iq . "$f" && sed 's/^/+/' "$f"; done; } \   # -I: skip binary files (zips, images)
  | grep -nE '^\+' \
  | grep -E "(sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|token|password)[\"']?\s*[:=]\s*[\"'][^\"']{12,}[\"'])"
```

Also `critical` if a `.env*` (other than `.env.example`) or `secrets.json` is added.
Confirm each hit is a real credential, not a test fixture or placeholder, before
calling it critical. Never print the value.

## Forbidden paths

From the collector's `excluded` list and `files`: any change under
`server/clones/**` → `critical` (never committed); under `**/src/vendor/ui/**` →
`major` (vendored, not ours to edit); a changed lockfile with no `package.json` change
→ `major`.

## Onion grep checks (changed files only)

Run only over files in the diff, and only the **added lines** count:

- `routes.ts` gains an import of `drizzle-orm` or `db/schema` → `critical`
  (transport must never query; `onion-architecture`).
- `service.ts` / `helpers.ts` gains an import of `db/schema`, `drizzle-orm`, or a
  concrete adapter class (`OctokitGitHubClient`, `AnthropicProvider`, …) → `major`.
- A new multi-write use case (≥2 repository writes in one service method) with no
  `db.transaction` → `major`.
- `reviewer-core/src/**` gains an import of `fs`, `node:fs`, `process.env`, a DB or
  HTTP client → `critical` (must stay a pure ring with an injected `LLMProvider`).
- `e2e/**` gains an import from `../server` or `../client` source → `major`.
- A new route without `schema.response` → `minor` (repo-wide gap; do not escalate).
