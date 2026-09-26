# Severity rubric

Only `critical` blocks. Keep it narrow and evidenced so the gate stays trusted.

## critical (BLOCK)

Must be **verified** (code re-read at `file:line`) **and on a changed line**, and be one of:

- **Security:** injection, path traversal, unvalidated URL/path reaching `git`/`fs`,
  secret in the diff, credentials logged or returned to the client, auth/authorization
  bypass, unsafe `innerHTML`/`dangerouslySetInnerHTML` with untrusted input, SSRF.
- **Data loss / corruption:** destructive migration, `rm -rf` on a computed path, a
  multi-write sequence that can leave partial state on a hot path, deleting user data
  without scope (`workspaceId`).
- **Broken build or behavior:** typecheck or tests failing in a touched package,
  schema changed without a migration, an edited existing migration, a contract
  change that breaks a consumer.
- **Ring violation that breaks the architecture's core rule:** `routes.ts` importing
  the DB layer, `reviewer-core` importing IO.
- **Forbidden change:** committing `server/clones/**`.

## major (report, do not block)

Rule violations from the skills without direct harm: layering inside allowed
tolerance, missing tests for new logic, duplicated constants/helpers, oversized
component that should be split, missing `error.tsx`/`loading.tsx` for a new route,
hardcoded user-facing strings, `'use client'` at a route root, mutation object passed
as a prop, missing index for a new query, missing transaction on a new multi-write.

## minor

Naming, file placement nits, comment/style, missing `schema.response`.

## Not a finding

- Pre-existing issues on unchanged lines (baseline).
- Issues already recorded in an `INSIGHTS.md` entry and untouched by this diff.
- Style the formatter/linter owns.
- Speculation without evidence ("might be a problem").

## Attribution of failing checks

See "Changed-lines rule" in SKILL.md: failures in changed code are critical;
failures elsewhere are shown as "possibly pre-existing or caused by this diff" and
resolved with the user, never silently dropped.
