import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + nested CLAUDE.md +
 * skills + subagents, loaded via settingSources:["project"]) behaves as documented. Every verdict
 * comes from the ACTUAL trace (Agent/Task, Skill, Read tool_use blocks), never from model prose.
 *
 * Read-only: Read/Grep/Glob/Agent/Skill only, enforced as a hard `tools` cap; every case also
 * asserts no Bash/Write/Edit appears in the trace.
 *
 * Budget: 6 sessions total (cap: 6).
 *   1. reads · server+client   — ONE session, one independently-reported check per doc
 *   2. reads control           — same prompt as (1), empty tmpdir, no project context
 *   3. reads · core+tests      — second session; no control of its own (1+2 already prove the
 *                                 harness, not the prompt, is what routes the reads)
 *   4. dispatch                — separate: long multi-task prompts make the model skip the dispatch
 *   5. activation (+)          — separate
 *   6. activation (−)          — separate: a negative is only meaningful when nothing pushes toward the skill
 *
 * Doc-reading is merged only two parts at a time: a 4-part prompt made gemini-2.5-flash do the
 * first part and skip the other three (CI run on PR #9; haiku did the same locally, see the root
 * INSIGHTS.md, What Doesn't Work). Dispatch/activation are never merged.
 */
export const cases: WorkflowCase[] = [
  // --- 1 + 2: doc-reading routing, server + client, treatment + control ---------------------------
  {
    kind: "session",
    name: "docs routing · server+client",
    // Parts name a concrete file under each package so the NESTED CLAUDE.md is reachable. None
    // mentions CLAUDE.md / INSIGHTS / README — reading them must come from the harness.
    prompt: [
      "Нічого не змінюй у файлах — лише аналіз. Зроби по порядку:",
      "1. Я хочу додати новий ендпоінт POST /reviews/:id/rerun у server/src/modules/reviews/routes.ts. Скажи, що треба врахувати.",
      "2. Я хочу змінити сторінку client/src/app/agents/page.tsx. Скажи, що треба врахувати.",
    ].join("\n"),
    expectFilesRead: [
      // Nested CLAUDE.md is injected by the harness, NOT read via the Read tool, so it never shows
      // in the trace. Its observable effect is the "Read INSIGHTS.md first" rule each one carries.
      "server/INSIGHTS.md", // from server/CLAUDE.md          (part 1)
      "server/README.md", //   root "Read when": API route     (part 1)
      "client/INSIGHTS.md", // from client/CLAUDE.md          (part 2)
      "client/README.md", //   root "Read when": page / hook   (part 2)
    ],
    control: true, // same prompt, no project context → none of the files above may be read
    maxTurns: 14,
  },

  // --- 3: doc-reading routing, reviewer-core + tests (no control of its own) ----------------------
  {
    kind: "session",
    name: "docs routing · core+tests",
    prompt: [
      "Нічого не змінюй у файлах — лише аналіз. Зроби по порядку:",
      "1. Я хочу змінити збирання промпту в reviewer-core/src/index.ts. Скажи, що треба врахувати.",
      "2. Я хочу додати тест для reviewer-core/src/index.ts. Скажи, де і як.",
    ].join("\n"),
    expectFilesRead: [
      "reviewer-core/INSIGHTS.md", // from reviewer-core/CLAUDE.md (part 1)
      "TESTING.md", //                root "Read when": adding a test (part 2)
    ],
    maxTurns: 14,
  },

  // --- 4: dispatch -------------------------------------------------------------------------------
  {
    kind: "dispatch",
    // Does NOT name the subagent: routing must come from the agent's `description`.
    name: "architecture-review task dispatches the architecture-reviewer subagent",
    prompt:
      "Перед мерджем зроби архітектурне рев'ю змін у " +
      "evals/agents/architecture-reviewer/fixtures/checkout-service.diff — перевір межі шарів " +
      "(domain / service / repository) і залежності між ними.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 8,
  },

  // --- 5: activation, positive -------------------------------------------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a found root cause",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків: розмірність колонки не збіглася " +
      "після зміни моделі ембедингів (1536 vs 3072). Це і була причина бага — хочу це зафіксувати, " +
      "щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },

  // --- 6: activation, negative -------------------------------------------------------------------
  {
    kind: "activation",
    name: "engineering-insights does NOT activate on a plain question",
    prompt: "Яка різниця між pnpm і npm?",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
