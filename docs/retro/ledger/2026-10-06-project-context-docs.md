# Retro — Project Context docs page (1a), spec → plan → /run-plan

**Date:** 2026-10-06
**Mode:** base
**Run retro'd:** `spec-creator` (3 cosmetic spec fixes) → `implementation-planner`
(pass 1 + pass 2 via `SendMessage`) → `/run-plan` on
`specs/2026-10-05-project-context-docs.plan.md` (wave 0–3, review, one fix round
requested by the user) → two `/security-review` passes. Artifact: commits
`3260133`, `53e2571`, `e1c6fba`, `4d657a8` (server API + client page + e2e flow +
style) and the plan file itself.

## Timeline

Order is dispatch order; rows marked `∥` ran in parallel with the previous row.

| # | Agent | Dispatch | Purpose | Tokens | Tool uses | Duration | Outcome |
|---|---|---|---|---|---|---|---|
| 1 | implementation-planner | `Agent` (fresh) | Pass 1: requirements review of the 1a spec | 117,932 | 20 | 3m23s | 6 questions, 8 recommendations, mode question |
| 2 | implementation-planner | `SendMessage` | Pass 2: full Implementation Plan (multi-agent) | 142,161 | 5 | 3m13s | Plan with 21 tasks, 19 AC/NFR rows |
| 3 | spec-creator ∥ | `Agent` (fresh) | Fix EC-8 row, stray `;.`, diagram label | 47,463 | 9 | 25s | 3 lines changed |
| 4 | implementer | `Agent` (fresh) | T1 read-only clone-reader audit (stop-gate) | 59,725 | 16 | 1m00s | `T1 VERDICT: GO`, 19 harmless findings |
| 5 | implementer | `Agent` (fresh) | T2–T4 contracts, port, client vendor sync | 53,407 | 8 | 45s | done; corrected plan's `65 537 × €` arithmetic |
| 6 | test-writer | `Agent` (fresh) | T5, T6 failing server tests | 109,829 | 19 | 3m02s | 3 test files, all red for the right reason |
| 7 | implementer ∥ | `Agent` (fresh) | T11, T7–T10, T12 client page, 5 red Edit tests | 107,073 | 24 | 3m10s | done; T12 red on purpose |
| 8 | implementer (2A) | `Agent` (fresh) | T13–T18 server implementation | not reported | not reported | not reported | **failed: stalled 600s** (files T13–T17 were on disk) |
| 9 | implementer (2B) ∥ | `Agent` (fresh) | T19 Edit mode, T20 build | 51,166 | 9 | 56s | done, 5 tests green, build passes |
| 10 | implementer (2A) | `SendMessage` | Resume T13–T18 | not reported | not reported | not reported | **failed: stalled 600s again** |
| 11 | implementer | `Agent` (fresh) | T18 perf test only | 42,765 | 7 | 31s | done, p95 54.7 ms |
| 12 | implementer ∥ | `Agent` (fresh) | T21 e2e flow only | 39,861 | 11 | 24s | written, not run, typecheck impossible |
| 13 | architecture-reviewer | `Agent` (fresh) | Review round 1 | 47,594 | 16 | 37s | 0 blocker / 0 high, 1 medium, 3 low, 1 nit |
| 14 | plan-verifier ∥ | `Agent` (fresh) | Verify plan T1–T21 + 15 AC + 4 NFR | 107,260 | 38 | 1m39s | MET 32, PARTIAL 3, UNVERIFIABLE 3, NOT MET 0 |
| 15 | implementer | `Agent` (fresh — **flagged**, signal 1) | Fix arch findings #1, #2 (server) | 39,999 | 14 | 36s | done, adapter no longer imports a module |
| 16 | implementer ∥ | `Agent` (fresh — **flagged**, signal 1) | Fix #4 + AC-8 test (client) | 37,588 | 7 | 20s | done |
| 17 | Explore | `Agent` (fresh) | /security-review pass 1 | 86,901 | 24 | 51s | no finding (Bash/Grep unavailable to it) |
| 18 | general-purpose | `Agent` (fresh) | /security-review pass 2, unreviewed areas | 132,650 | 30 | 1m03s | 1 candidate, pre-existing, filtered out |

## Totals and per-phase breakdown

Session total (rows with `usage`, 16 of 18 dispatches): **1,223,374 tokens**.
`/run-plan` chain only (rows 1–16): **1,003,823 tokens**. Rows 8 and 10 reported
no usage and are excluded, so both totals are **lower bounds**.

| Phase | Rows | Tokens | % of chain | Tokens per output unit |
|---|---|---|---|---|
| Planning (planner ×2) | 1, 2 | 260,093 | 25.9% | 6,207 / AC reviewed (pass 1, 19); 6,770 / plan task (pass 2, 21) |
| Spec fix | 3 | 47,463 | 4.7% | 15,821 / line changed (3) — `n/a` as a real unit |
| Wave 0 | 4, 5 | 113,132 | 11.3% | 3,143 / audit finding (T1, 19); 17,802 / task (T2–T4) |
| Wave 1 | 6, 7 | 216,902 | 21.6% | 2,034 / test (1A, 54 tests); 3,824 / file (1B, ~28 files) |
| Wave 2 + 3 | 9, 11, 12 (+ 8, 10 not reported) | 133,792 | 13.3% | 12,792 / file (2B, 4); 42,765 / file (T18, 1); 19,930 / file (T21, 2) |
| Review | 13, 14 | 154,854 | 15.4% | 9,519 / finding (arch, 5); 2,681 / row (verifier, 40) |
| Fix round | 15, 16 | 77,587 | 7.7% | 10,000 / file (server, 4); 9,397 / file (client, 4) |
| Security (outside chain) | 17, 18 | 219,551 | — | `n/a` (1 filtered candidate) |

**Flags (≥ 30% of the chain or disproportionate):**
- **Planning + spec fix together = 307,556 tokens = 30.6% of the chain.** Planner
  pass 2 alone is the largest single dispatch (142,161, 14.2%).
- **Wave 2A is the only large unaccounted cost:** two 600 s stalls with no
  `usage`, so the true chain total is higher than reported and the 2A phase is
  invisible in the table.
- **plan-verifier (107,260) cost as much as the whole client wave 1B (107,073)**
  while ending with 3 PARTIAL / 3 UNVERIFIABLE rows, 2 of which (T20, NFR-1) it
  could not run because of the guard (signal 7). The orchestrator re-ran both
  by hand.
- **Security pass 2 (132,650)** produced one candidate that `git diff main`
  showed to be pre-existing (`readFile` unchanged on `main`).

**Trend** (up to five most recent ledger entries; totals the entry did not state
are `not reported`):

| Date | Agents | Session tokens |
|---|---|---|
| 2026-08-12 | 1 dispatch (`implementer`) | 70,353 |
| 2026-09-08 | not a dispatch run (manual entry) | not reported |
| **2026-10-06** | 18 dispatches (16 reporting usage) | **1,223,374** (lower bound) |

## Signals (heuristics, with evidence)

1. **Handoff efficiency.** Rows 15 and 16 are fresh `Agent` dispatches to
   `implementer` for fixes in files that rows 8/10 (2A server) and 9 (2B client)
   owned. `run-plan/SKILL.md` says fix-loop rounds go to the same implementer via
   `SendMessage`. Mitigations that make this ambiguous: 2A was stalled twice, so
   a fresh dispatch was safer for the server fix; and the round was triggered by
   the user's request, not by the automatic fix list (no blocker/high). Row 11
   (T18) and row 12 (T21) are new tasks, not fixes, so fresh is fine. Rows 2
   (planner `SendMessage`) is the correct pattern.
2. **Clarification rounds per agent.** `implementation-planner`: 1 round (6
   questions, mode, spec-fix question) before pass 2. Every other agent: 0.
3. **Artifact rework.** Counted across reports in this session:
   `DocPanel.test.tsx` 3 touches (rows 7, 9 untouched-assert, 16);
   `fs-store.ts`, `project-context/helpers.ts`, `constants.ts` 2 each (rows 8/10
   then 15); `ContextView/constants.ts` created (row 7) then deleted (row 16);
   `DocList.tsx`/`styles.ts` 2 (row 7, then a manual restyle). The arch-fix
   rework (rows 15–16) is the only avoidable one: the adapter → module import was
   in the plan's own T14 text ("prefer the import").
4. **Duplicated information.** Planner pass 1 spot-checked the clone readers
   (`ripgrep.ts`, `walk.ts`) and row 4 repeated the full audit; this was
   deliberate (stop-gate), but T1's findings were then not carried forward — the
   verifier (row 14) reports `T1 UNVERIFIABLE: No report in my inputs`.
5. **Misses.**
   - Plan T2/T5 quoted `65 537 × "€"` as over the 262 144-byte cap (it is
     196 611 bytes); found only by row 5.
   - Plan T5 told the test-writer to capture the NFR-4 log line "via a pino
     stream", but `pino` is not a direct dependency and `buildApp` takes no logger;
     row 6 had to invent a `app.log.child` wrapper.
   - Plan T1 said "copy findings into §9", which `run-plan`'s own rule
     ("never edit the plan") forbids.
   - Plan wave 0 put a stop-gate task and 3 follow-on tasks in one implementer;
     an implementer cannot pause for the orchestrator, so the orchestrator split
     it into rows 4 and 5 at run time.
   - T21 (e2e typecheck) was unrunnable: `e2e/` had no `node_modules`.
6. **Friction and ease per agent.**
   | Agent | Hard | Smooth |
   |---|---|---|
   | implementation-planner | none | pass 1 → answers → pass 2 in 2 rounds |
   | spec-creator | none | 3-line edit, 25 s |
   | implementer wave 0 (T1) | none | clean verdict, 16 tool uses |
   | implementer wave 0 (T2–T4) | plan arithmetic wrong (fixed itself) | 45 s |
   | test-writer | `agent-guard` rejected `>` in `node -e` probes; no logger seam | failing-first tests exact |
   | implementer 1B | `mockFetch` only returns 200/404 | 5 red tests as specified |
   | implementer 2A | **stalled twice**, 6 tasks in one dispatch, no `usage` | T13–T17 on disk and green |
   | implementer 2B | none | built and green in 56 s |
   | implementer T18 / T21 | `e2e` typecheck impossible | each finished in ≤ 31 s as a one-task dispatch |
   | architecture-reviewer | no Bash, read only the patch | 5 evidence-quoted findings |
   | plan-verifier | guard blocked 4 command classes (signal 7) | complete 40-row table |
   | Explore / general-purpose (security) | Bash/Grep/Glob unavailable | each stated its coverage limits |
7. **Guard and permission blocks.**
   - `plan-verifier` (row 14): 4 command classes refused: `docker info`, an
     env-var-prefixed run (`DEVDIGEST_PERF=1 pnpm exec vitest …`), `pnpm build`,
     and `|` inside `rg` patterns.
   - `test-writer` (row 6): ≥ 1 refusal of `>` (including `=>` and `2>&1`) in
     `node -e` one-liners.
   - No refusal reported by the implementers; rows 15 and 16 avoided
     the env-prefix form because the orchestrator warned them.
   - Two `security-review` subagents had Bash/Grep (and one Glob) unavailable;
     this is tool availability, not `agent-guard`.
   - **Unconfirmed:** an orchestrator-level `scripts/check-all.sh` hung once
     (10-minute tool timeout) while the stalled 2A instance was still running;
     the same tree later passed in 2 s. Cause not established.

## Recommendations

✅ `Target: .claude/skills/run-plan/SKILL.md` — in "1. Implement", add: a plan
task marked as a stop-gate gets its own implementer dispatch; the orchestrator
reads its report and decides GO/STOP before dispatching the rest of the wave, and
the gate task's report path is passed to `plan-verifier` as an input. Justified
by signals 5 and 4: row 4 was improvised at run time and row 14 returned
`T1 UNVERIFIABLE: No report in my inputs`.

✅ `Target: .claude/skills/run-plan/SKILL.md` — in "1. Implement", cap a
wave-owner dispatch at about 3–4 tasks of one package and, after a watchdog
stall, replace the same prompt with narrower dispatches instead of resuming it;
require run-mode-only test commands with a timeout in the first prompt.
Justified by signal 6/7: 2A carried 6 tasks and stalled twice (2 × 600 s, no
usage), while single-task dispatches (rows 11, 12) finished in 24–31 s.

✅ `Target: .claude/skills/run-plan/SKILL.md` — in "4. Fix loop" (and the
user-requested fix case), state the exception to the `SendMessage` rule: a fresh
`implementer` is correct only after a stall or when the owning instance is
gone; otherwise continue the owner. Justified by signal 1: rows 15–16 were
fresh dispatches (77,587 tokens) for files owned by rows 8–10.

✅ `Target: .claude/skills/run-plan/SKILL.md` — under "Rules", add: before the
orchestrator closes a `PARTIAL` by running `pnpm build` itself, check
`pgrep -fl "next dev"` in a **separate** call and stop if a dev server is up
(a build rewrites `.next` under it; `client/INSIGHTS.md` 2026-09-19). Justified
by the miss in this run: the check and the build were chained, `pgrep` reported
pid 55697, and the build still ran.

✅ `Target: .claude/agents/implementation-planner.md` — in the plan template,
(a) put any stop-gate task in its own wave, and (b) never tell an agent to write
into the plan or spec ("copy into §9"); gate results go in the agent's report.
Justified by signal 5: plan T1 contradicted `run-plan`'s "never edit the plan"
rule and forced a run-time split.

✅ `Target: .claude/agents/implementation-planner.md` — before a test seam or a
numeric boundary goes into a task, check it against the code: `grep` the
dependency in `package.json` (T5's "pino stream", `pino` is not a direct
dependency) and compute byte arithmetic (T2/T5's `65 537 × €` = 196 611 bytes,
not over 262 144). Justified by signal 5; adjacent to, but not a repeat of, the
2026-08-12 recommendation about stating literal strings for checks.

✅ `Target: .claude/hooks/agent-guard.sh` — in the `plan-verifier` profile,
allow the read-only verification commands the plan itself prescribes (`docker
info`, `pnpm exec vitest run <file>` with a leading `VAR=value`, and `rg`
patterns containing `|`), or have the plan list "orchestrator-run checks". This
is a hypothesis: the guard's deny rules were not re-read for this retro, only
the refusals the agents reported. Justified by signal 7: the verifier ended with
T20 and NFR-1 as PARTIAL/UNVERIFIABLE for guard reasons and the orchestrator
re-ran both manually.

*(Checked the Recommendations of the two most recent entries
(`2026-09-08-spec06-multi-agent-review.md`, `2026-08-12-workflow-retro-skill.md`):
none of the above repeats them, so nothing is marked `RECURRING`. The cost-per-output,
trend and guard-block signals were exercised for the first time on this run and
all three produced usable evidence.)*
