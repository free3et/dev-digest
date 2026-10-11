/**
 * End-of-job budget report for the model-backed CI jobs. Informational: it never fails the job
 * (the OpenRouter key's own limit is the hard cap); it writes a table to the step summary and
 * emits a ::warning:: when this job's spend passes EVAL_JOB_BUDGET_USD.
 *
 * Spend = key-wide `usage` now minus EVAL_USAGE_START (set by openrouter-check.mjs). Jobs that run
 * in parallel share the key, so the figure can include a sibling job's calls — treat it as an
 * upper bound. Tokens come from this job's own results/records.jsonl.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const budget = Number(process.env.EVAL_JOB_BUDGET_USD ?? "2");
const url = process.env.OPENROUTER_AUTH_URL ?? "https://openrouter.ai/api/v1/auth/key";
const startRaw = process.env.EVAL_USAGE_START;

let records = 0;
let tokensIn = 0;
let tokensOut = 0;
const file = "results/records.jsonl";
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      records++;
      tokensIn += r.metrics?.inputTokens ?? 0;
      tokensOut += r.metrics?.outputTokens ?? 0;
    } catch {
      /* partial line from a killed run */
    }
  }
}

let spend = null;
let remaining = null;
try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}` } });
  if (res.ok) {
    const d = (await res.json()).data ?? {};
    if (startRaw !== undefined && startRaw !== "") spend = Number(d.usage ?? 0) - Number(startRaw);
    remaining = d.limit_remaining ?? null;
  }
} catch {
  /* report what we have */
}

const money = (n) => (n == null || Number.isNaN(n) ? "n/a" : `$${n.toFixed(4)}`);
const lines = [
  `### Eval budget (${process.env.GITHUB_JOB ?? "job"})`,
  "",
  "| metric | value |",
  "|---|---|",
  `| model calls recorded | ${records} |`,
  `| tokens in / out | ${tokensIn} / ${tokensOut} |`,
  `| key spend during this job (upper bound) | ${money(spend)} |`,
  `| job budget (EVAL_JOB_BUDGET_USD) | $${budget} |`,
  `| key credit remaining | ${remaining == null ? "unlimited / n/a" : `$${Number(remaining).toFixed(2)}`} |`,
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
if (spend != null && spend > budget) {
  console.log(`::warning title=Eval budget exceeded::this job spent about ${money(spend)} (budget $${budget})`);
}
