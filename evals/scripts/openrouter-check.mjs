/**
 * Preflight for the model-backed CI jobs. Fails fast (seconds, no tokens) with a readable reason
 * instead of three cryptic 401s deep inside vitest:
 *   - the secret is empty / whitespace / not an OpenRouter key;
 *   - OpenRouter rejects it;
 *   - the key's remaining credit is below EVAL_MIN_CREDIT_USD (the key's own spend limit is the
 *     hard cap; this is the early stop before it).
 * Records the usage at job start in $GITHUB_ENV (EVAL_USAGE_START) for budget-report.mjs.
 * Never prints the key. Env: OPENROUTER_API_KEY, EVAL_MIN_CREDIT_USD (default 1),
 * OPENROUTER_AUTH_URL (test hook).
 */
import { appendFileSync } from "node:fs";

const key = process.env.OPENROUTER_API_KEY ?? "";
const url = process.env.OPENROUTER_AUTH_URL ?? "https://openrouter.ai/api/v1/auth/key";
const minCredit = Number(process.env.EVAL_MIN_CREDIT_USD ?? "1");
const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

if (!key.trim()) {
  fail("OPENROUTER_API_KEY is empty or whitespace - add it as a repository secret (not a Dependabot/environment secret) in THIS repo");
}
const prefix = key.startsWith("sk-or-") ? "ok" : "UNEXPECTED (does not start with sk-or-)";

let res;
try {
  res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
} catch (e) {
  fail(`cannot reach OpenRouter: ${e instanceof Error ? e.message : e}`);
}
console.log(`key length=${key.length} prefix=${prefix} /auth/key -> HTTP ${res.status}`);
if (!res.ok) {
  fail(`OpenRouter rejected the key (HTTP ${res.status}); check the secret for a missing sk-or-v1- prefix, stray spaces/newlines or a wrong token`);
}

const d = (await res.json()).data ?? {};
const usage = Number(d.usage ?? 0);
const limit = d.limit ?? null;
const remaining = d.limit_remaining ?? (limit != null ? limit - usage : null);
const usd = (n) => (n == null ? "unlimited" : `$${Number(n).toFixed(2)}`);
console.log(`credit: used ${usd(usage)} · limit ${usd(limit)} · remaining ${usd(remaining)} · floor $${minCredit}`);

if (remaining != null && remaining < minCredit) {
  fail(`OpenRouter key has ${usd(remaining)} left, below EVAL_MIN_CREDIT_USD=$${minCredit}; raise the key limit or lower the floor`);
}
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `EVAL_USAGE_START=${usage}\n`);
