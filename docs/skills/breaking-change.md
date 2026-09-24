---
name: breaking-change
description: Use when a diff changes a route, a request or response schema, a status code or a shared contract. Detect breaking changes for existing callers.
type: rubric
---

# Breaking vs compatible

Compare the old and the new wire shape of every changed route or contract.

**Breaking (CRITICAL unless the diff also ships a compatibility path):**
- A route removed, renamed, or its method or path changed.
- A response field removed, renamed, or its type changed; a field that could
  not be `null` now can (or the reverse for request fields).
- A request field that was optional is now required, or a new required field
  appears without a default.
- An enum value removed or renamed; a new enum value returned to callers that
  switch exhaustively.
- A status code or error envelope shape changed
  (`{ error: { code, message, details } }`).
- Pagination, ordering or default-filter behaviour changed.
- Authentication or authorization requirements tightened.

**Compatible (do not report):** a new optional request field, a new response
field, a new route, a looser validation.

For every breaking change name the concrete caller that breaks (search the
diff and the repo for consumers of that route or contract) and the fix: keep
the old shape, add the new one alongside, or version the route. A signature
change with no updated consumer is CRITICAL.

## Example

**Bad** — an existing field is renamed in place, breaking every caller that
reads `cost_usd`:

```diff
 export const RunStats = z.object({
-  cost_usd: z.number().nullable(),
+  total_cost_usd: z.number().nullable(),
 });
```

**Good** — the old field stays; the new one is added alongside and the old
one is marked for removal separately (see `deprecation-policy`):

```diff
 export const RunStats = z.object({
   cost_usd: z.number().nullable(),
+  total_cost_usd: z.number().nullable(), // superset of cost_usd; see deprecation-policy
 });
```
