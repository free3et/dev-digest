/**
 * Runs the cases of one suite sequentially and finalises it (spec A AC-9,
 * AC-12, NFR-1/3/5). Ring 2, private to the module.
 *
 * Writes `eval_runs` + `eval_suite_runs` ONLY: no `agent_runs`, no
 * `run_traces`, no `runBus` (NG-9). `execute` never throws and never leaves
 * the suite `running`: every path ends in `finalizeSuiteFromStored`.
 */
import type { LLMProvider, Provider } from '@devdigest/shared';
import type { EvalCaseRow, EvalSuiteRunRow } from '../../db/rows.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { EVAL_CASE_TIMEOUT_MS } from './constants.js';
import { runCase } from './case-runner.js';
import { aggregateSuite, suiteLogLine, toEvalCase, toStoredCaseRun, truncateError } from './helpers.js';
import type { EvalRepository, SuiteFinal } from './repository.js';

export interface SuiteJob {
  suite: EvalSuiteRunRow;
  agent: { provider: Provider; model: string; systemPrompt: string };
  /** Resolved `### name` skill blocks in prompt order. */
  skillBlocks: string[];
  /** The frozen case set, in name order. */
  cases: EvalCaseRow[];
  /** The request logger (`req.log`), so the line is attributable and capturable. */
  log?: PinoLike;
}

export interface SuiteExecutorDeps {
  repo: EvalRepository;
  llmSingleShot: (id: Provider, opts: { timeoutMs: number }) => Promise<LLMProvider>;
}

/**
 * `running` -> final state, from the STORED case rows (so a re-score never
 * needs a model call, NFR-8). `override` forces status / reason (failed
 * provider resolve, top-level failure, boot reaper). Returns what was written.
 */
export async function finalizeSuiteFromStored(
  repo: EvalRepository,
  suite: Pick<EvalSuiteRunRow, 'id' | 'workspaceId' | 'casesTotal'>,
  override?: { status: 'failed'; error: string },
): Promise<SuiteFinal> {
  const detail = await repo.getSuiteDetail(suite.workspaceId, suite.id);
  const agg = aggregateSuite((detail?.runs ?? []).map((r) => toStoredCaseRun(r.run, r.expectedOutput)));
  const final: SuiteFinal = {
    status: override?.status ?? agg.status,
    casesTotal: suite.casesTotal,
    casesCompleted: agg.cases_completed,
    casesPassed: agg.cases_passed,
    casesErrored: agg.cases_errored,
    recall: agg.recall,
    precision: agg.precision,
    citationAccuracy: agg.citation_accuracy,
    costUsd: agg.cost_usd,
    error: override ? truncateError(override.error) : agg.error,
  };
  await repo.finalizeSuite(suite.id, final);
  return final;
}

export class EvalSuiteExecutor {
  constructor(private deps: SuiteExecutorDeps) {}

  async execute(job: SuiteJob): Promise<void> {
    const { repo } = this.deps;
    const { suite, log } = job;
    try {
      let llm: LLMProvider;
      try {
        llm = await this.deps.llmSingleShot(job.agent.provider, { timeoutMs: EVAL_CASE_TIMEOUT_MS });
      } catch (err) {
        // No provider, no key: nothing ran, the suite says why (AC-12).
        await this.finish(job, { status: 'failed', error: errorText(err) });
        return;
      }

      for (const row of job.cases) {
        const evalCase = toEvalCase(row);
        const { result, costUsd, durationMs } = await runCase({
          systemPrompt: job.agent.systemPrompt,
          model: job.agent.model,
          skills: job.skillBlocks,
          llm,
          evalCase,
        });
        // One transaction per case: the stored row and the live counters agree.
        await repo.transaction(async (tx) => {
          await repo.insertCaseRun(
            {
              caseId: row.id,
              suiteRunId: suite.id,
              actualOutput: result.output,
              pass: result.pass,
              recall: result.recall,
              precision: result.precision,
              citationAccuracy: result.citation_accuracy,
              durationMs,
              costUsd,
            },
            tx,
          );
          await repo.bumpProgress(suite.id, result.outcome, tx);
        });
      }
      await this.finish(job);
    } catch (err) {
      try {
        await this.finish(job, { status: 'failed', error: errorText(err) });
      } catch (inner) {
        // Last resort: the DB itself is failing. The boot reaper cleans up.
        log?.error({ suite_run_id: suite.id, err: errorText(inner) }, 'eval suite could not be finalised');
      }
    }
  }

  private async finish(job: SuiteJob, override?: { status: 'failed'; error: string }): Promise<void> {
    const final = await finalizeSuiteFromStored(this.deps.repo, job.suite, override);
    const line = suiteLogLine(job.suite.id, final);
    job.log?.info(
      {
        suite_run_id: job.suite.id,
        agent_id: job.suite.agentId,
        status: final.status,
        cases_passed: final.casesPassed,
        cases_total: final.casesTotal,
        cost_usd: final.costUsd,
      },
      line,
    );
  }
}

function errorText(err: unknown): string {
  return truncateError(err);
}
