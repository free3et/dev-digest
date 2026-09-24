---
name: deprecation-policy
description: Use when a diff removes or replaces a route or a response field. Check that the change follows a deprecation path instead of breaking callers.
type: convention
---

# API deprecation policy

- Removing a route or a response field needs a deprecation period: keep the old shape working, mark it deprecated (`Deprecation` / `Sunset` response headers or a comment plus a changelog line), and add the replacement alongside.
- Renaming is a removal plus an addition: do both, in that order, across two releases.
- A changed default (page size, sort order, filter) is a behaviour change and follows the same rule.
- If the diff removes something with no deprecation step and a consumer in the repo still uses it, report **CRITICAL** and name the consumer. If the removal is announced but the replacement is missing, report **WARNING**.

## Example

**Bad** — the field is removed outright in the same PR that stops needing it:

```diff
 export const RunStats = z.object({
-  legacy_cost: z.number().nullable(),
   cost_usd: z.number().nullable(),
 });
```

**Good** — the field stays, marked deprecated, with the replacement already
shipped and a note on when the old one goes away:

```diff
 export const RunStats = z.object({
-  legacy_cost: z.number().nullable(),
+  /** @deprecated use cost_usd. Removed after the 2026-Q4 release. */
+  legacy_cost: z.number().nullable(),
   cost_usd: z.number().nullable(),
 });
```
