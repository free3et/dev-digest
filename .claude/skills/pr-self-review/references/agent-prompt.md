# Subagent prompt template (step 3)

Fill the `<…>` parts. One agent per non-empty area (`ui`, `backend`, `core`, `cross`).

```
READ-ONLY review of local changes in /Users/oleksandra/dev-digest, area: <area>.
Do NOT edit files, run git commit/push/add, install packages, or run tests.
Exclude server/clones/** and node_modules from every grep/glob.

First load these skills with the Skill tool and apply their rules:
<skills for this area, from the collector's `groups`>

Review ONLY these files, and only the CHANGED line ranges (right side of the diff):
<path: [[start,end], ...]  — one per line>

Read the whole file for context, but report a finding only if its line lies in a
changed range. If you notice a problem on an unchanged line, put it in `baseline`,
not `findings`, and never as critical.

Severity rubric (only `critical` blocks the PR):
<paste references/severity.md "critical" and "major" sections>

Return JSON only:
{
  "findings": [
    {"id": "<area>-1", "file": "...", "line": 0, "severity": "critical|major|minor",
     "skill": "<skill whose rule applies>", "rule": "<rule / checklist item>",
     "evidence": "<what you read at file:line, quoted briefly>",
     "fix": "<concrete change>"}
  ],
  "baseline": [{"file": "...", "line": 0, "note": "..."}]
}
Verify every claim by reading the code or grepping before including it. No
speculation. Cap: 15 findings, most severe first. Never include secret values.
```

## Verification prompt (step 4, one per critical)

```
Verify this claimed CRITICAL finding, independently and read-only:
<finding JSON>
Re-read <file> around line <line>. Answer JSON only:
{"confirmed": true|false, "on_changed_line": true|false, "reason": "<one sentence>"}
Changed ranges for this file: <ranges>. Confirm only if the code at that line really
has the defect described and it fits the critical rubric.
```
