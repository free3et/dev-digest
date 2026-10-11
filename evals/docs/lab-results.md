# Eval lab results — what was measured, on what, and what it does not prove

`evals/results/` is gitignored (append-only scratch), so the numbers that back the lab live here.
Every figure below comes from a file or a CI log; where a number is a single run it says so.

## 1. Skill: with vs without the artifact (benchmark)

`skills/dependency-checker`, `claude-haiku-4-5` under test, `claude-sonnet-5` as judge, 3 runs per
configuration, local, sha `e15be3c` (dirty), 2026-10-11. Full report:
[`benchmark-dependency-checker-2026-10-11.md`](benchmark-dependency-checker-2026-10-11.md).

| metric | with skill (candidate) | without (baseline) |
|---|---|---|
| pass rate | **100%** | 67% |
| tokens out (mean ± sd) | 4814 ± 2139 | 2451 ± 549 |

Lift: **+33 points**, and it is carried by one case — the 5-section report structure with a Mermaid
graph: 3/3 with the skill, 0/3 without. Two cases are `non_discriminating` (the raw model already
passes them), so they prove the skill does not hurt, not that it helps.

A second skill, `onion-architecture` (skill-creator format, 32-file fixture tree, 15 planted
findings): v1.0.0 vs v1.2.0, 5 runs each, both 75/75 — saturated; only the noise moved
(`fromContainer` reported in 4/5 v1.0.0 runs vs 0/5). Recorded in the root `INSIGHTS.md`; the
run outputs are not kept.

## 2. Agent: two versions, repeated runs (superseded)

`eval:repeat agents/architecture-reviewer -n 2`, local, sha `e15be3c` (dirty), three labels:

| label | flags both | out-of-scope | rule identifier | benign rename |
|---|---|---|---|---|
| version-A | 0/2 | 2/2 | 0/2 | 0/2 |
| version-A2 | 0/2 | 2/2 | 0/2 | 0/2 |
| version-B | 0/2 | 1/2 | 0/2 | 0/2 |

Read this table with the caveat: in **all three** labels the practices "names the exact rule
identifier" and "ends with a PASS/FAIL verdict" were 0/2. They were unsatisfiable (the identifiers
exist only in the cases file; the agent contract has no verdict), so the series cannot separate
versions. The cases were fixed afterwards (see `INSIGHTS.md`, 2026-10-11) and the series was
**not** re-taken; `eval:repeat` is capped at 2 runs per label.

## 3. CI measurements (PR #9, OpenRouter, judge `google/gemini-2.5-flash`)

| tier | model | runs | result per run | cost per job |
|---|---|---|---|---|
| skills | `deepseek/deepseek-chat` | 3 | 3/3, 3/3, 3/3 | $0.08–0.14 |
| agents | `google/gemini-2.5-flash` | 4 | 4/4, 2/4, 3/4, 3/4 | $0.16–0.17 |
| agents | `anthropic/claude-haiku-5.5` | 2 | 4/4, 4/4 | $0.12–0.14 |
| workflow | `google/gemini-2.5-flash` | 5 | 1–3 failing of 15–16 | $0.05–0.14 |
| workflow | `anthropic/claude-haiku-5.5` | 1 | 2 failing of 15 (dispatch, activation) | $0.07 |

Reading it honestly: agents on haiku-5.5 are 2/2 green, gemini fluctuated on identical code, so the
agents tier is report-first until it holds over more runs. The workflow tier's dispatch case passes
on gemini and fails on haiku-5.5 (it reviews inline); positive activation fails on both. A full PR
costs about $0.2–0.4.

## 4. Baseline comparison

`evals/baseline.json` holds, per tier, the model it was measured on and per test one of `pass`
(every baseline run passed), `fail` (every run failed - a known failure) or `flaky` (runs disagreed).
It is built from several CI runs, not one:

| tier | model | baseline runs | pass / fail / flaky |
|---|---|---|---|
| skills | `deepseek/deepseek-chat` | 2 (38170824386, 38171501822) | 3 / 0 / 0 |
| agents | `anthropic/claude-haiku-5.5` | 3 (38172901170, 38173972020, 38174790930) | 4 / 0 / 0 |
| workflow | `google/gemini-2.5-flash` | 4 (38171501822, 38172256061, 38173972020, 38174790930) | 10 / 1 / 4 |

A single-run baseline was tried first and raised four false "regressions" on the next run, so
`flaky` exists for a reason. The workflow tier on gemini, same code, per run (P pass / F fail):

| test | 71501822 | 72256061 | 73972020 | 74790930 |
|---|---|---|---|---|
| reads `server/INSIGHTS.md`, `server/README.md`, `reviewer-core/INSIGHTS.md` | P | P | P | P |
| reads `client/INSIGHTS.md`, `client/README.md` | F | P | P | F |
| reads `TESTING.md` | P | F | P | F |
| dispatches `architecture-reviewer` | P | P | P | F |
| `engineering-insights` activates on a root cause | F | F | F | F |
| controls, read-only checks, negative activation | P | P | P | P |

CI runs `scripts/baseline.mjs compare <tier>` after each model job: regressions, improvements and
missing tests go to the step summary, regressions also as `::warning`. It is report-first; set
`EVAL_BASELINE_STRICT=1` to make a regression fail the job. Only files that ran are compared, and a
different model than the baseline's is flagged as indicative.

Refresh after a deliberate change (comma-separate several runs; use history files from the run
artifacts): `pnpm eval:baseline update <tier> --history a.jsonl,b.jsonl --model <slug> --source "<runs>"`.

## 5. What this does not prove

- **Positive activation is not demonstrated** on any CI model; it stays an advisory red.
- Agent version comparison needs a new series on the corrected cases; at n=2 per label it shows
  direction, not significance.
- Single CI runs are single points: gemini went 4/4 and then 2/4 on identical code.
- The baseline is as good as the runs it was taken from (2-4 per tier); `flaky` marks only what
  those runs happened to show, so refresh it as evidence accumulates.
