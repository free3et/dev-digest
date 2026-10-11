import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second real diff whose violations are reviewer-core boundaries (no I/O except the injected
// LLMProvider; findings must pass groundFindings() before they are emitted). The practices ask
// the agent to ATTRIBUTE each finding to a rule or the doc it comes from — they must not demand a
// specific identifier string, because no document defines one: the agent's own scheme is
// A*/F*/X* plus the module INSIGHTS.md it is told to read first.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// Practices must stay inside the agent's own output contract (.claude/agents/architecture-reviewer.md):
// severities are blocker/high/medium/low/nit, the report ends with "Rules checked, no violation" /
// "Could not verify", and it has NO PASS/FAIL verdict — the gate decision belongs to /run-plan
// (blocker|high with confidence >= 0.5). A practice that asks for more than the contract is a
// test defect, not a model failure.
//
// Threshold 0.8: one nondeterministic practice must not turn a PR red, but a case that misses two
// of six does.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a violation of the inward-only dependency rule between Domain and Presentation layers",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of DI discipline (concrete adapters/repositories must be constructed only in the composition root / container)",
      "names a rule for EVERY finding (a rule id such as A*/X*, or the named rule from the onion-architecture skill) rather than describing the problem only in prose",
      "assigns a severity (blocker/high/medium/low/nit) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "reports the counts by severity in its Summary",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the inward-only-dependencies import issue itself (no runtime bug/security finding fabricated as an architecture rule)",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule identifier for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "attributes the fs-import finding to a rule or to the document it comes from (a rule id, or a file such as reviewer-core/README.md or INSIGHTS.md) rather than only describing it in prose",
      "attributes the skipped-gate finding to a rule or to the document it comes from rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "assigns a severity (blocker/high/medium/low/nit) to each finding",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only `low`/`nit` observations) — it does not invent a blocker/high/medium finding",
      "any observation it does report is rated `low` or `nit` and is not presented as a blocker/high/medium violation of a documented rule",
      "lists the rules it checked under 'Rules checked, no violation' instead of approving silently",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
];
