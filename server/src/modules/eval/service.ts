import type {
  EvalCase,
  EvalCaseDraft,
  EvalCaseOverrides,
  EvalDashboardRow,
  EvalRecentRun,
  EvalDryRunRequest,
  EvalDryRunResult,
  EvalExpectationInput,
  EvalExpectationKind,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  LLMProvider,
  Provider,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { EVAL_CASE_TIMEOUT_MS, EVAL_HISTORY_LIMIT, EVAL_MAX_CASES } from './constants.js';
import { describeCaseError, runCase } from './case-runner.js';
import { EvalRepository, type Tx } from './repository.js';
import {
  buildCaseDraft,
  buildExpectation,
  dashboardRows,
  decidedKind,
  dryRunLogLine,
  errorCase,
  evalSkillBlock,
  expectationRefusal,
  toDryRunResult,
  toEvalCase,
  toEvalRunRecord,
  toEvalRecentRun,
  toEvalSuiteRun,
  withServerSource,
} from './helpers.js';
import { EvalSuiteExecutor, finalizeSuiteFromStored } from './suite-executor.js';
import type { DerivedCase } from './types.js';

/** R-3 checks that need the derived case; the schema-level ones ran at the route. */
function assertExpectationAllowed(
  input: EvalExpectationInput,
  draft: EvalCaseDraft,
  currentKind: EvalExpectationKind,
): void {
  const refusal = expectationRefusal(input, draft, currentKind);
  if (refusal === 'file_not_in_diff') {
    throw new AppError('file_not_in_diff', 'expected_output.file must be the file of the frozen diff', 422);
  }
  if (refusal === 'kind_mismatch') {
    throw new AppError(
      'kind_mismatch',
      "expected_output.kind must equal the finding's current decision",
      422,
    );
  }
}

/** The slice of `container.agentsRepo` this service reads. */
export interface AgentLookup {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; version: number; provider: Provider; model: string; systemPrompt: string } | undefined>;
  enabledSkillsForPrompt(
    agentId: string,
  ): Promise<{ skill: { name: string; body: string; source: string } }[]>;
}

export interface EvalServiceDeps {
  repo: EvalRepository;
  agents: AgentLookup;
  /** `container.llmSingleShot`: overrides win, openrouter gets maxRetries 0. */
  llmSingleShot: (id: Provider, opts: { timeoutMs: number }) => Promise<LLMProvider>;
  /** Test seam: the per-case timeout of a dry-run; defaults to `EVAL_CASE_TIMEOUT_MS`. */
  caseTimeoutMs?: number;
}

/**
 * Eval: cases (create from a decided finding, list, delete), suite runs (start,
 * history, detail), the dashboard and the boot reaper. Multi-step writes run in
 * a transaction this service opens; every repository call inside gets `tx`.
 */
export class EvalService {
  constructor(private deps: EvalServiceDeps) {}

  static fromContainer(container: Container): EvalService {
    return new EvalService({
      repo: new EvalRepository(container.db),
      agents: container.agentsRepo,
      llmSingleShot: (id, opts) => container.llmSingleShot(id, opts),
    });
  }

  /**
   * The one derivation path of a would-be case (Spec C): draft, dry-run and
   * create all read it, so a draft equals a bodiless save by construction.
   * Spec A table R-1, in order: not_found -> finding_undecided -> no_agent ->
   * duplicate -> patch_unavailable. Reads only; `tx` joins a caller's
   * transaction.
   */
  private async deriveCase(workspaceId: string, findingId: string, tx?: Tx): Promise<DerivedCase> {
    const { repo, agents } = this.deps;
    const scope = await repo.getFindingScope(workspaceId, findingId, tx);
    if (!scope) throw new NotFoundError('Finding not found');

    const kind = decidedKind(scope);
    if (!kind) {
      throw new AppError('finding_undecided', 'Accept or dismiss the finding first', 409);
    }

    const agent = scope.agent_id ? await agents.getById(workspaceId, scope.agent_id) : undefined;
    if (!scope.agent_id || !agent) {
      throw new AppError('no_agent', "The finding's review has no agent, or the agent no longer exists", 409);
    }

    const existing = await repo.findCaseBySourceFinding(workspaceId, findingId, tx);
    if (existing) {
      throw new AppError('duplicate', 'An eval case already exists for this finding', 409, {
        case_id: existing.id,
      });
    }

    if (!scope.patch) {
      throw new AppError(
        'patch_unavailable',
        'No persisted patch for this file; open the pull request once and try again',
        409,
      );
    }

    const expectation = buildExpectation(scope, kind, scope.agent_id);
    const draft = buildCaseDraft(scope, kind, scope.agent_id, expectation);
    return { scope, kind, agent, draft, expectation };
  }

  /** Spec C AC-1: the case a bodiless save would store now. Writes nothing, takes no lock. */
  async getCaseDraft(workspaceId: string, findingId: string): Promise<EvalCaseDraft> {
    return (await this.deriveCase(workspaceId, findingId)).draft;
  }

  /**
   * R-1 then R-3. The finding lock makes two concurrent creates for one
   * finding serial, so exactly one inserts; `kind_mismatch` compares against
   * the decision read under that lock (EC-6). No body or `{}` = Spec A.
   */
  async createCaseFromFinding(
    workspaceId: string,
    findingId: string,
    overrides?: EvalCaseOverrides,
  ): Promise<EvalCase> {
    const { repo } = this.deps;
    return repo.transaction(async (tx) => {
      await repo.lockFinding(tx, findingId);

      const { draft, kind, expectation } = await this.deriveCase(workspaceId, findingId, tx);

      let expectedOutput = expectation;
      if (overrides?.expected_output) {
        assertExpectationAllowed(overrides.expected_output, draft, kind);
        expectedOutput = withServerSource(overrides.expected_output, expectation);
      }

      const row = await repo.insertCase(
        {
          workspaceId,
          agentId: draft.agent_id,
          name: overrides?.name ?? draft.name,
          inputDiff: draft.input_diff,
          inputFiles: draft.input_files,
          inputMeta: draft.input_meta,
          expectedOutput,
        },
        tx,
      );
      return toEvalCase(row);
    });
  }

  /**
   * Spec C dry-run: one stateless, guarded model call on the would-be case.
   * Writes nothing: no transaction, no insert, no run bus, no agent_runs /
   * run_traces. A missing key or any call failure is a 200 `outcome: error`;
   * only R-1 / R-3 refusals throw. The override expectation is used for
   * scoring only and never reaches the prompt.
   */
  async dryRunCase(
    workspaceId: string,
    findingId: string,
    body?: EvalDryRunRequest,
    log?: PinoLike,
  ): Promise<EvalDryRunResult> {
    const { agents } = this.deps;
    const { draft, kind, agent, expectation } = await this.deriveCase(workspaceId, findingId);

    let scoring = expectation;
    const override = body?.expected_output;
    if (override) {
      assertExpectationAllowed(override, draft, kind);
      scoring = withServerSource(override, expectation);
    }

    const skillRows = await agents.enabledSkillsForPrompt(agent.id);
    const timeoutMs = this.deps.caseTimeoutMs ?? EVAL_CASE_TIMEOUT_MS;

    const started = Date.now();
    let result: EvalDryRunResult;
    try {
      const llm = await this.deps.llmSingleShot(agent.provider, { timeoutMs });
      const run = await runCase({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        skills: skillRows.map((r) => evalSkillBlock(r.skill)),
        llm,
        evalCase: {
          input_diff: draft.input_diff,
          input_meta: draft.input_meta,
          expected_output: scoring,
        },
        timeoutMs,
      });
      result = toDryRunResult(run.result, scoring, run.costUsd, run.durationMs, agent.version);
    } catch (err) {
      // runCase never throws; this is `llmSingleShot` (no provider / no key =
      // ConfigError) which resolves BEFORE runCase, so map it here like
      // suite-executor does. Plan R5.
      result = toDryRunResult(
        errorCase(scoring.kind, describeCaseError(err)),
        scoring,
        null,
        Date.now() - started,
        agent.version,
      );
    }

    log?.info(
      {
        finding_id: findingId,
        agent_id: agent.id,
        outcome: result.outcome,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      },
      dryRunLogLine(findingId, result.outcome, result.cost_usd, result.duration_ms),
    );
    return result;
  }

  /** The agent's cases sorted by name; 404 for an unknown or foreign agent. */
  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const rows = await this.deps.repo.listCasesByAgent(workspaceId, agentId);
    return rows.map(toEvalCase);
  }

  /** 404 unknown/foreign case; 409 `eval_run_in_progress` while the agent's suite runs. */
  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const { repo } = this.deps;
    const found = await repo.getCase(workspaceId, caseId);
    if (!found) throw new NotFoundError('Eval case not found');
    await repo.transaction(async (tx) => {
      await repo.lockAgent(tx, found.ownerId);
      const running = await repo.getRunningSuite(workspaceId, found.ownerId, tx);
      if (running) {
        throw new AppError('eval_run_in_progress', 'An eval run of this agent is in progress', 409);
      }
      const ok = await repo.deleteCase(workspaceId, caseId, tx);
      if (!ok) throw new NotFoundError('Eval case not found');
    });
  }

  // ------------------------------------------------------------ suites

  /**
   * Start one suite run (spec A R-2): 404 unknown/foreign agent; under the
   * agent lock 409 `eval_run_in_progress`, 422 `no_cases`, 422
   * `too_many_cases`. A disabled agent may run. Returns the `running` row; the
   * cases execute detached, sequentially, and write no `agent_runs` / trace.
   */
  async startSuite(workspaceId: string, agentId: string, log?: PinoLike): Promise<EvalSuiteRun> {
    const { repo, agents } = this.deps;
    const agent = await agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const skillRows = await agents.enabledSkillsForPrompt(agent.id);

    const started = await repo.transaction(async (tx) => {
      await repo.lockAgent(tx, agent.id);
      if (await repo.getRunningSuite(workspaceId, agent.id, tx)) {
        throw new AppError('eval_run_in_progress', 'An eval run of this agent is already in progress', 409);
      }
      const cases = await repo.listCasesByAgent(workspaceId, agent.id, tx);
      if (cases.length === 0) {
        throw new AppError('no_cases', 'This agent has no eval cases yet', 422);
      }
      if (cases.length > EVAL_MAX_CASES) {
        throw new AppError(
          'too_many_cases',
          `An eval suite runs at most ${EVAL_MAX_CASES} cases; this agent has ${cases.length}`,
          422,
        );
      }
      const suite = await repo.insertSuiteRun(
        {
          workspaceId,
          agentId: agent.id,
          agentVersion: agent.version,
          caseIds: cases.map((c) => c.id),
          skills: skillRows.map((r) => r.skill.name),
        },
        tx,
      );
      if (!suite) {
        throw new AppError('eval_run_in_progress', 'An eval run of this agent is already in progress', 409);
      }
      return { suite, cases };
    });

    const executor = new EvalSuiteExecutor({ repo, llmSingleShot: this.deps.llmSingleShot });
    void executor
      .execute({
        suite: started.suite,
        agent: { provider: agent.provider, model: agent.model, systemPrompt: agent.systemPrompt },
        skillBlocks: skillRows.map((r) => evalSkillBlock(r.skill)),
        cases: started.cases,
        ...(log ? { log } : {}),
      })
      .catch(() => undefined); // `execute` never rejects; belt and braces for a detached promise
    return toEvalSuiteRun(started.suite);
  }

  /** The suite plus one record per case that still exists, in `case_ids` order. 404 foreign. */
  async getSuite(workspaceId: string, id: string): Promise<EvalSuiteRunDetail> {
    const detail = await this.deps.repo.getSuiteDetail(workspaceId, id);
    if (!detail) throw new NotFoundError('Eval run not found');
    return {
      ...toEvalSuiteRun(detail.suite),
      cases: detail.runs.map((r) => toEvalRunRecord(r.run, r.caseName)),
    };
  }

  /** At most 50 suites of the agent, newest first; 404 for an unknown or foreign agent. */
  async listSuites(workspaceId: string, agentId: string): Promise<EvalSuiteRun[]> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const rows = await this.deps.repo.listSuitesByAgent(workspaceId, agentId, EVAL_HISTORY_LIMIT);
    return rows.map(toEvalSuiteRun);
  }

  /** Spec D AC-1: finished suites of all agents of the workspace, newest first, at most `limit`. */
  async recentRuns(workspaceId: string, limit: number): Promise<EvalRecentRun[]> {
    const rows = await this.deps.repo.listRecentFinishedSuites(workspaceId, limit);
    return rows.map((r) => toEvalRecentRun(r.suite, r.agentName));
  }

  /** Spec B AC-10: one row per agent with cases; drop rows first, then by name. */
  async dashboard(workspaceId: string): Promise<EvalDashboardRow[]> {
    return dashboardRows(await this.deps.repo.dashboardInputs(workspaceId));
  }

  /**
   * Boot reaper (spec A NFR-3): a `running` suite left by a dead process
   * becomes `failed` / "interrupted"; its metrics are aggregated over the case
   * rows already stored, which are kept. Returns the number reaped.
   */
  async reapInterrupted(): Promise<number> {
    const { repo } = this.deps;
    const running = await repo.listRunningSuites();
    let reaped = 0;
    let failed = 0;
    // One suite at a time and isolated: a suite left `running` keeps its agent
    // blocked (partial unique index -> 409 eval_run_in_progress), so a failure
    // on one must not strand the rest.
    for (const suite of running) {
      try {
        await finalizeSuiteFromStored(repo, suite, { status: 'failed', error: 'interrupted' });
        reaped += 1;
      } catch {
        try {
          // Fallback: close the row with the live counters and no metrics.
          await repo.finalizeSuite(suite.id, {
            status: 'failed',
            casesTotal: suite.casesTotal,
            casesCompleted: suite.casesCompleted,
            casesPassed: suite.casesPassed,
            casesErrored: suite.casesErrored,
            recall: null,
            precision: null,
            citationAccuracy: null,
            costUsd: null,
            error: 'interrupted',
          });
          reaped += 1;
        } catch {
          failed += 1;
        }
      }
    }
    if (failed > 0) {
      throw new Error(`could not reap ${failed} of ${running.length} interrupted eval suite(s)`);
    }
    return reaped;
  }
}
