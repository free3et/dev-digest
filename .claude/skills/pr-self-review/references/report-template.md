# Report template (`.claude/pr-self-review/report.md`)

```markdown
# PR self review — <branch> vs <base> (<base_sha short>..<head_sha short>)

**Verdict: BLOCK | PASS | PASS_WITH_WAIVER**   ·   <date>   ·   skill v1.0.0
Working tree dirty: yes|no (rerun after committing)

## Scope
<N> files reviewed (<ui> UI · <backend> backend · <core> core · <other> other),
<M> excluded. Skills run: <list>. Packages checked: <list>.

## Critical (blocking)
### C1 — <short claim>
`<file>:<line>` · rule: `<skill> / <rule>` · verified: yes
Evidence: <what the code does>
Fix: <concrete change>

## Major (not blocking)
- `<file>:<line>` — <claim> — fix: <…>

## Minor
- `<file>:<line>` — <claim>

## Deterministic checks
| Check | Result | Note |
| --- | --- | --- |
| server typecheck | ok | |
| server tests | 144 passed | Docker up |
| schema-needs-migration | ok | migration 0010 present |
| secrets-scan | ok | |

## Baseline (not blocking)
<count> pre-existing issues seen on unchanged lines; already tracked in INSIGHTS.md: <n>.

## Waivers
None. | C1 — waived by the user: "<reason>" (<time>)

## Next steps
1. …
```

If the verdict is `BLOCK`, the last line is:
"Do not open the PR until these are fixed or explicitly waived. This gate is not
enforced by git or CI."
