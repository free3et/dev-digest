---
name: semver-discipline
description: Use when a diff edits an agent's prompt/config, a skill's body, or a shared contract. Check that a behavior-changing edit is versioned, not folded silently into what looks like a patch.
type: convention
---

# Version discipline

This repo doesn't publish its own API as a semver package, but the same
discipline applies to the things that get versioned in place:

- `agents.version` bumps on every config change (`isConfigChange` in
  `src/modules/agents/helpers.ts`) and snapshots into `agent_versions`. An
  edit that changes review behavior (system prompt, model, strategy,
  ci_fail_on, output_schema) must go through the path that bumps this
  version — never a direct column update that skips the snapshot.
- `skills.version` bumps on every body edit and snapshots into
  `skill_versions`. A skill body change that alters what the rubric flags is
  a new version other agents' `agent_versions` snapshots can diff against;
  editing the body without bumping the version breaks reproducibility (a past
  run's snapshot no longer matches what the skill body actually said then).
- A wire contract change (`@devdigest/shared`) that breaks an existing field
  is not a version bump on its own — it needs the compatibility path in
  `breaking-change` first. Versioning here is about **agents and skills
  staying reproducible**, not about giving the HTTP API a version number.

## Example

**Bad** — the skill's body is edited directly in a migration/seed re-run,
with no new `skill_versions` row, so a past agent run's snapshot silently
stops matching what the skill says today:

```ts
await db.update(t.skills).set({ body: newBody }).where(eq(t.skills.id, id));
```

**Good** — the edit goes through the service, which bumps `version` and
writes the version row atomically with the body change:

```ts
await skillsService.update(workspaceId, id, { body: newBody }); // version++, skill_versions row inserted
```
