---
name: response-schema
description: Use when a diff changes what a route returns. Check that the route declares a Zod `schema.response`, and that its shape matches exactly what the handler sends — no extra fields, no missing fields, correct nullability.
type: convention
---

# Response schema discipline

- Every route that returns data declares `schema.response` from the same
  `@devdigest/shared` contract the handler builds its payload from. A route
  with no `schema.response` can leak internal fields the client was never
  meant to see, and the zod serializer compiler has nothing to enforce.
- The DTO the handler `return`s must satisfy the declared schema exactly:
  no field present in the handler's object but missing from the schema (it
  gets silently stripped — the client never sees it, and that stripping is a
  finding if the client actually needs the field), and no field in the schema
  that the handler never sets (it serializes as `undefined`/`null` where a
  caller may not expect it).
- Nullability in the schema must match the DB column: a column with no
  `.notNull()` maps to `.nullable()` in the schema, not to a field the schema
  claims is always present.
- A field that changes from a plain value to `nullable()` (or the reverse) is
  a breaking change — see `breaking-change`, not a routine schema edit.

## Example

**Bad** — no `schema.response`, so an internal `workspace_id` on the row
silently reaches the client, and nothing catches it:

```ts
app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
  return service.get(req.params.id); // ships whatever the DB row has
});
```

**Good** — the response schema is declared from the same contract the DTO
mapper produces, so an extra or missing field is a build-time/runtime
serialization error, not a silent leak:

```ts
app.get(
  '/skills/:id',
  { schema: { params: IdParams, response: { 200: Skill } } },
  async (req) => {
    return toSkillDto(await service.get(req.params.id)); // shape == Skill
  },
);
```
