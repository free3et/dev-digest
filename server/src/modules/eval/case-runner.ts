/**
 * Runs ONE eval case: one model call through the real review pipeline
 * (`reviewPullRequest`: prompt assembly -> single-pass -> grounding gate) with
 * the case's frozen diff and PR meta, then scores it. Ring 2, private to the
 * module. Never throws: every failure becomes an `error` outcome (spec A
 * AC-10, NFR-2).
 *
 * Deliberately NOT passed to the engine (spec A AC-11): callers, repoMap,
 * specs (project context), intent, memory. The prompt differs from a real run
 * only by what was frozen into the case.
 */
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type {
  EvalCaseMeta,
  EvalExpectation,
  LLMProvider,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { ConfigError } from '../../platform/errors.js';
import { EVAL_CASE_TIMEOUT_MS, EVAL_MAX_OUTPUT_TOKENS } from './constants.js';
import { errorCase, evalTaskLine, scoreCase, truncateError } from './helpers.js';
import type { CaseResult } from './types.js';

/** The case fields the runner reads (an `EvalCase` fits). */
export interface RunnableCase {
  input_diff: string;
  input_meta: EvalCaseMeta;
  expected_output: EvalExpectation;
}

export interface RunCaseInput {
  systemPrompt: string;
  model: string;
  /** Resolved `### name` skill blocks in prompt order (empty = none). */
  skills: string[];
  /** Already resolved through `container.llmSingleShot` (or a test override). */
  llm: LLMProvider;
  evalCase: RunnableCase;
  /** Test seam; defaults to `EVAL_CASE_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export interface CaseRunResult {
  result: CaseResult;
  costUsd: number | null;
  durationMs: number;
}

class EvalTimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${Math.round(ms / 1000)} s (the call may still be billed)`);
    this.name = 'EvalTimeoutError';
  }
}

/**
 * Wraps a provider so every structured request is single-shot: no reprompt
 * retry, a token cap, a request timeout, and a wall-clock race. The port has
 * no abort signal (server INSIGHTS 2026-09-25), so after the timer wins the
 * call stays in flight and is still billed; its late result is IGNORED, the
 * race winner is final (plan R3).
 */
export function guardProvider(llm: LLMProvider, timeoutMs: number): LLMProvider {
  return {
    id: llm.id,
    listModels: () => llm.listModels(),
    complete: (req) => llm.complete(req),
    embed: (texts) => llm.embed(texts),
    completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      return new Promise<StructuredResult<T>>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new EvalTimeoutError(timeoutMs));
        }, timeoutMs);
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        };
        let pending: Promise<StructuredResult<T>>;
        try {
          pending = llm.completeStructured<T>({
            ...req,
            maxRetries: 0,
            maxTokens: EVAL_MAX_OUTPUT_TOKENS,
            timeoutMs,
          });
        } catch (err) {
          settle(() => reject(err));
          return;
        }
        pending.then(
          (res) => settle(() => resolve(res)),
          (err) => settle(() => reject(err)),
        );
      });
    },
  };
}

const SCHEMA_FAILURE = /failed schema|schema validation/i;

/** Map a thrown value to the stored error text (always through `truncateError`). */
export function describeCaseError(err: unknown): string {
  if (err instanceof EvalTimeoutError) return truncateError(err.message);
  if (err instanceof ConfigError) return truncateError(err.message);
  const message = err instanceof Error ? err.message : String(err);
  if (SCHEMA_FAILURE.test(message)) {
    return truncateError(
      `model output failed schema validation (possibly truncated at max_tokens=${EVAL_MAX_OUTPUT_TOKENS})`,
    );
  }
  return truncateError(message);
}

export async function runCase(input: RunCaseInput): Promise<CaseRunResult> {
  const { evalCase } = input;
  const started = Date.now();
  const guarded = guardProvider(input.llm, input.timeoutMs ?? EVAL_CASE_TIMEOUT_MS);
  try {
    const outcome = await reviewPullRequest({
      systemPrompt: input.systemPrompt,
      model: input.model,
      diff: parseUnifiedDiff(evalCase.input_diff),
      llm: guarded,
      strategy: 'single-pass',
      maxRetries: 0,
      ...(input.skills.length > 0 ? { skills: input.skills } : {}),
      ...(evalCase.input_meta.pr_body ? { prDescription: evalCase.input_meta.pr_body } : {}),
      task: evalTaskLine(evalCase.input_meta),
    });
    return {
      result: scoreCase(evalCase.expected_output, outcome.review.findings, outcome.dropped),
      costUsd: outcome.costUsd,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      result: errorCase(evalCase.expected_output.kind, describeCaseError(err)),
      costUsd: null,
      durationMs: Date.now() - started,
    };
  }
}
