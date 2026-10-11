/**
 * Baseline comparison for the model-backed eval tiers (report-first: it never fails a job unless
 * EVAL_BASELINE_STRICT=1).
 *
 *   node scripts/baseline.mjs compare <skills|agents|workflow> [--history results/history.jsonl]
 *   node scripts/baseline.mjs update  <skills|agents|workflow> --history <file> --model <slug> --source <text>
 *
 * Source of truth for a run is results/history.jsonl, written by src/trend-reporter.ts: one
 * pass/fail row per vitest test. results/records.jsonl is NOT used: for workflow cases its
 * `outcome` is "the session did not error", not "the assertions held".
 *
 * Baseline = evals/baseline.json, committed. Per tier: the model it was measured on, where it came
 * from, and pass|fail per test (known failures are recorded as fail, so they read as "=" and an
 * improvement is visible). Only tests in files that ran in this job are compared, so a matrix job
 * for one skill/agent is not blamed for the others.
 *
 * Pure node, no dependencies.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(EVALS_DIR, "baseline.json");
const TIERS = ["skills", "agents", "workflow"];

const [mode, tier, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
if (!["compare", "update"].includes(mode) || !TIERS.includes(tier)) {
  console.error("usage: baseline.mjs <compare|update> <skills|agents|workflow> [--history f] [--model m] [--source s]");
  process.exit(2);
}
const historyFile = flag("history", join(EVALS_DIR, "results", "history.jsonl"));

/** describe-suite rows ("file > workflow:review") are not tests. */
const isSuite = (nodeid) => /^[^>]+ > (workflow|agent|skill):[^>›]+$/.test(nodeid);

/** Latest run in the file -> Map(nodeid -> "pass" | "fail"); a duplicate nodeid fails if any failed. */
function loadRun(file) {
  if (!existsSync(file)) return new Map();
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r && (r.outcome === "pass" || r.outcome === "fail") && r.nodeid && !isSuite(r.nodeid));
  if (!rows.length) return new Map();
  const last = rows[rows.length - 1].run_id;
  const out = new Map();
  for (const r of rows.filter((x) => x.run_id === last)) {
    out.set(r.nodeid, out.get(r.nodeid) === "fail" || r.outcome === "fail" ? "fail" : "pass");
  }
  return out;
}

const fileOf = (nodeid) => nodeid.split(" > ")[0];
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { schema: 1, tiers: {} };

if (mode === "update") {
  const run = loadRun(historyFile);
  if (!run.size) {
    console.error(`no test rows in ${historyFile}`);
    process.exit(1);
  }
  baseline.tiers[tier] = {
    model: flag("model", process.env.EVAL_MODEL ?? "unknown"),
    judge: process.env.EVAL_JUDGE_MODEL ?? null,
    source: flag("source", "manual"),
    recorded: new Date().toISOString().slice(0, 10),
    tests: Object.fromEntries([...run].sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + "\n");
  const pass = [...run.values()].filter((v) => v === "pass").length;
  console.log(`baseline[${tier}] updated: ${pass}/${run.size} pass, model ${baseline.tiers[tier].model}`);
  process.exit(0);
}

// ---- compare ---------------------------------------------------------------------------------
const base = baseline.tiers?.[tier];
const run = loadRun(historyFile);
const out = [];
const log = (s = "") => out.push(s);

if (!base) {
  log(`### Baseline (${tier})\n\nNo baseline recorded for this tier — run \`node scripts/baseline.mjs update ${tier} …\`.`);
} else if (!run.size) {
  log(`### Baseline (${tier})\n\nNo test results in \`${historyFile}\` — nothing to compare.`);
} else {
  const filesRun = new Set([...run.keys()].map(fileOf));
  const keys = new Set([...run.keys(), ...Object.keys(base.tests).filter((k) => filesRun.has(fileOf(k)))]);
  const rows = [];
  let regressions = 0;
  let improved = 0;
  let missing = 0;
  for (const k of [...keys].sort()) {
    const b = base.tests[k];
    const r = run.get(k);
    let status;
    if (b && !r) {
      status = "MISSING";
      if (b === "pass") missing++;
    } else if (!b) {
      status = "new";
    } else if (b === r) {
      status = "=";
    } else if (b === "pass") {
      status = "REGRESSION";
      regressions++;
    } else {
      status = "improved";
      improved++;
    }
    rows.push({ k, b: b ?? "—", r: r ?? "—", status });
  }
  const model = process.env.EVAL_MODEL ?? "unknown";
  log(`### Baseline comparison (${tier})`);
  log();
  log(`Baseline: \`${base.model}\` · ${base.source} · ${base.recorded}. This run: \`${model}\`.`);
  if (base.model !== model) log(`> Different model from the baseline — the comparison is indicative only.`);
  log();
  log("| test | baseline | now | |");
  log("|---|---|---|---|");
  for (const x of rows) log(`| ${x.k.split(" > ").slice(1).join(" > ")} | ${x.b} | ${x.r} | ${x.status} |`);
  log();
  log(`**${regressions} regression(s)**, ${improved} improved, ${missing} missing, ${rows.filter((x) => x.status === "=").length} unchanged.`);
  for (const x of rows.filter((y) => y.status === "REGRESSION" || (y.status === "MISSING" && y.b === "pass"))) {
    console.log(`::warning title=Eval ${x.status} (${tier})::${x.k.split(" > ").slice(1).join(" > ")}`);
  }
  if (regressions > 0 && process.env.EVAL_BASELINE_STRICT === "1") {
    console.log(out.join("\n"));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
    process.exit(1);
  }
}

console.log(out.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
