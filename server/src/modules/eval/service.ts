import type {
  EvalCase,
  EvalCaseDraft,
  EvalCaseCopyRequest,
  EvalCaseManualCreate,
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
import {
  EVAL_CASE_TIMEOUT_MS,
  EVAL_EXPECTATION_TITLE_MAX,
  EVAL_HISTORY_LIMIT,
  EVAL_MAX_CASES,
} from './constants.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { describeCaseError, runCase } from './case-runner.js';
import { EvalRepository, type Tx } from './repository.js';
import {
  buildCaseDraft,
  buildExpectation,
  buildSingleFileDiff,
  dashboardRows,
  decidedKind,
  dryRunLogLine,
  errorCase,
  evalSkillBlock,
  expectationRefusal,
  hostRefusal,
  singleRunLogLine,
  toDryRunResult,
  toEvalCase,
  toEvalRunRecord,
  toEvalRecentRun,
  toEvalSuiteRun,
  withServerSource,
} from './helpers.js';
import { EvalSuiteExecutor, finalizeSuiteFromStored } from './suite-executor.js';
import type { DerivedCase, EvalOwner } from './types.js';

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

function ownerOf(row: { ownerKind: 'agent' | 'skill'; ownerId: string }): EvalOwner {
  return { kind: row.ownerKind, id: row.ownerId };
}

function runInProgress(owner: EvalOwner): AppError {
  return new AppError('eval_run_in_progress', `An eval run of this ${owner.kind} is in progress`, 409);
}

function tooManyCases(owner: EvalOwner): AppError {
  const article = owner.kind === 'agent' ? 'An' : 'A';
  return new AppError('too_many_cases', `${article} ${owner.kind} has at most ${EVAL_MAX_CASES} eval cases`, 422);
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

/** The slice of `container.skillsRepo` this service reads (no `enabled` filter: a disabled skill can be evaluated). */
export interface SkillLookup {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; body: string; source: string; version: number } | undefined>;
}

export interface EvalServiceDeps {
  repo: EvalRepository;
  agents: AgentLookup;
  skills: SkillLookup;
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
      skills: container.skillsRepo,
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
          owner: { kind: 'agent', id: draft.agent_id },
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
      result = toDryRunResult(run.result, scoring, run.costUsd, run.durationMs, agent.version, null);
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
        null,
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
    const rows = await this.deps.repo.listCasesByOwner(workspaceId, { kind: 'agent', id: agentId });
    return rows.map(toEvalCase);
  }

  /** 404 unknown/foreign case; 409 `eval_run_in_progress` while a suite of the case's OWNER runs. */
  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const { repo } = this.deps;
    const found = await repo.getCase(workspaceId, caseId);
    if (!found) throw new NotFoundError('Eval case not found');
    const owner = ownerOf(found);
    await repo.transaction(async (tx) => {
      await repo.lockOwner(tx, owner);
      const running = await repo.getRunningSuite(workspaceId, owner, tx);
      if (running) throw runInProgress(owner);
      const ok = await repo.deleteCase(workspaceId, caseId, tx);
      if (!ok) throw new NotFoundError('Eval case not found');
    });
  }

  /**
   * A case written by hand (not from a finding): the user supplies the file,
   * the hunks and the expectation. `source` is null, the PR meta is a stub.
   * 404 unknown/foreign agent; 422 `invalid_diff` when the patch has no hunk
   * for the file; 422 `too_many_cases`; 409 `eval_run_in_progress`.
   */
  async createManualCase(workspaceId: string, agentId: string, body: EvalCaseManualCreate): Promise<EvalCase> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return this.insertManualCase(workspaceId, { kind: 'agent', id: agentId }, body);
  }

  /**
   * The same hand-written case for a skill (G1 AC-2). 404 unknown/foreign
   * skill; then the agent path's `invalid_diff` -> `eval_run_in_progress` ->
   * `too_many_cases` (R-G1).
   */
  async createSkillManualCase(workspaceId: string, skillId: string, body: EvalCaseManualCreate): Promise<EvalCase> {
    await this.requireSkill(workspaceId, skillId);
    return this.insertManualCase(workspaceId, { kind: 'skill', id: skillId }, body);
  }

  /** Shared by the agent and skill hand-written paths; the owner already exists. */
  private async insertManualCase(
    workspaceId: string,
    owner: EvalOwner,
    body: EvalCaseManualCreate,
  ): Promise<EvalCase> {
    const { repo } = this.deps;
    const ex = body.expected_output;
    const inputDiff = buildSingleFileDiff(ex.file, body.patch);
    const parsed = parseUnifiedDiff(inputDiff).files.find((f) => f.path === ex.file);
    if (!parsed || parsed.hunks.length === 0) {
      throw new AppError('invalid_diff', 'The patch must contain at least one @@ hunk', 422);
    }

    return repo.transaction(async (tx) => {
      await repo.lockOwner(tx, owner);
      if (await repo.getRunningSuite(workspaceId, owner, tx)) throw runInProgress(owner);
      const existing = await repo.listCasesByOwner(workspaceId, owner, tx);
      if (existing.length >= EVAL_MAX_CASES) throw tooManyCases(owner);
      const row = await repo.insertCase(
        {
          workspaceId,
          owner,
          name: body.name,
          inputDiff,
          inputFiles: [ex.file],
          inputMeta: { pr_number: 0, pr_title: body.name, pr_body: null, repo: 'manual' },
          expectedOutput: { ...ex, source: null },
        },
        tx,
      );
      return toEvalCase(row);
    });
  }

  /**
   * Copy an agent-owned case into a skill's set (G1 AC-3). The source row is
   * only read. R-G1 order: skill 404 -> source 404 -> `not_agent_case` ->
   * `eval_run_in_progress` -> `too_many_cases`. Copying twice makes two rows.
   */
  async copyCaseToSkill(workspaceId: string, skillId: string, body: EvalCaseCopyRequest): Promise<EvalCase> {
    const { repo } = this.deps;
    await this.requireSkill(workspaceId, skillId);
    const source = await repo.getCase(workspaceId, body.case_id);
    if (!source) throw new NotFoundError('Eval case not found');
    if (source.ownerKind !== 'agent') {
      throw new AppError('not_agent_case', 'Only an agent-owned case can be copied into a skill', 422);
    }
    const owner: EvalOwner = { kind: 'skill', id: skillId };
    return repo.transaction(async (tx) => {
      await repo.lockOwner(tx, owner);
      if (await repo.getRunningSuite(workspaceId, owner, tx)) throw runInProgress(owner);
      const existing = await repo.listCasesByOwner(workspaceId, owner, tx);
      if (existing.length >= EVAL_MAX_CASES) throw tooManyCases(owner);
      const row = await repo.insertCase(
        {
          workspaceId,
          owner,
          name: source.name,
          inputDiff: source.inputDiff ?? '',
          inputFiles: (source.inputFiles as string[] | null) ?? [],
          inputMeta: source.inputMeta,
          expectedOutput: source.expectedOutput,
          notes: source.notes,
        },
        tx,
      );
      return toEvalCase(row);
    });
  }

  /** The skill's cases sorted by name; 404 for an unknown or foreign skill. */
  async listSkillCases(workspaceId: string, skillId: string): Promise<EvalCase[]> {
    await this.requireSkill(workspaceId, skillId);
    const rows = await this.deps.repo.listCasesByOwner(workspaceId, { kind: 'skill', id: skillId });
    return rows.map(toEvalCase);
  }

  private async requireSkill(workspaceId: string, skillId: string) {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  /**
   * Edit a case's name and/or expectation. The frozen input and `source` stay;
   * the file must remain the file of the frozen diff (422 `file_not_in_diff`).
   * The kind may change (the user is redefining the case, not re-deciding the
   * finding). 404 unknown/foreign case; 409 `eval_run_in_progress`.
   */
  async updateCase(workspaceId: string, caseId: string, body: EvalCaseOverrides): Promise<EvalCase> {
    const { repo } = this.deps;
    const found = await repo.getCase(workspaceId, caseId);
    if (!found) throw new NotFoundError('Eval case not found');
    const current = toEvalCase(found);
    const next = body.expected_output;
    if (next && next.file !== current.input_files[0]) {
      throw new AppError('file_not_in_diff', 'expected_output.file must be the file of the frozen diff', 422);
    }
    const owner = ownerOf(found);
    return repo.transaction(async (tx) => {
      await repo.lockOwner(tx, owner);
      if (await repo.getRunningSuite(workspaceId, owner, tx)) throw runInProgress(owner);
      const row = await repo.updateCase(
        workspaceId,
        caseId,
        {
          name: body.name ?? current.name,
          expectedOutput: next ? withServerSource(next, current.expected_output) : current.expected_output,
        },
        tx,
      );
      if (!row) throw new NotFoundError('Eval case not found');
      return toEvalCase(row);
    });
  }

  /**
   * Run ONE stored case: a stateless, guarded model call like the dry-run
   * (nothing is stored, no suite row, no metrics move). An agent-owned case
   * runs its own agent; a skill-owned case runs through the host `agent_id`
   * with ONLY that skill in the prompt (G1 AC-6, AC-8). Refusals, all before
   * any model call (R-G2 / plan A4): case 404; agent case: `host_not_allowed`
   * then owner agent 404; skill case: skill 404, `host_required`,
   * `host_not_found`; then `file_not_in_diff`. An optional `expected_output`
   * overrides the expectation for SCORING only. A missing key or call failure
   * is a 200 `outcome: error`.
   */
  async runSingleCase(
    workspaceId: string,
    caseId: string,
    body?: EvalDryRunRequest,
    log?: PinoLike,
  ): Promise<EvalDryRunResult> {
    const { agents } = this.deps;
    const found = await this.deps.repo.getCase(workspaceId, caseId);
    if (!found) throw new NotFoundError('Eval case not found');
    const evalCase = toEvalCase(found);

    let agent: Awaited<ReturnType<AgentLookup['getById']>>;
    let skill: Awaited<ReturnType<SkillLookup['getById']>> | undefined;
    let skillBlocks: string[];
    if (found.ownerKind === 'skill') {
      skill = await this.requireSkill(workspaceId, found.ownerId);
      if (hostRefusal('skill', Boolean(body?.agent_id)) === 'host_required') {
        throw new AppError('host_required', 'A skill case needs a host agent: send agent_id', 422);
      }
      agent = await agents.getById(workspaceId, body!.agent_id!);
      if (!agent) throw new AppError('host_not_found', 'The host agent was not found', 422);
      skillBlocks = [evalSkillBlock(skill)];
    } else {
      if (hostRefusal('agent', Boolean(body?.agent_id)) === 'host_not_allowed') {
        throw new AppError('host_not_allowed', 'An agent case runs its own agent: omit agent_id', 422);
      }
      agent = await agents.getById(workspaceId, found.ownerId);
      if (!agent) throw new NotFoundError('Agent not found');
      const skillRows = await agents.enabledSkillsForPrompt(agent.id);
      skillBlocks = skillRows.map((r) => evalSkillBlock(r.skill));
    }

    const timeoutMs = this.deps.caseTimeoutMs ?? EVAL_CASE_TIMEOUT_MS;
    let scoring = evalCase.expected_output;
    const override = body?.expected_output;
    if (override) {
      if (override.file !== evalCase.input_files[0]) {
        throw new AppError('file_not_in_diff', 'expected_output.file must be the file of the frozen diff', 422);
      }
      scoring = withServerSource(override, evalCase.expected_output);
    }

    const skillVersion = skill ? skill.version : null;
    const started = Date.now();
    let result: EvalDryRunResult;
    try {
      const llm = await this.deps.llmSingleShot(agent.provider, { timeoutMs });
      const run = await runCase({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        skills: skillBlocks,
        llm,
        evalCase: { ...evalCase, expected_output: scoring },
        timeoutMs,
      });
      result = toDryRunResult(run.result, scoring, run.costUsd, run.durationMs, agent.version, skillVersion);
    } catch (err) {
      result = toDryRunResult(
        errorCase(scoring.kind, describeCaseError(err)),
        scoring,
        null,
        Date.now() - started,
        agent.version,
        skillVersion,
      );
    }
    log?.info(
      {
        case_id: caseId,
        ...(skill ? { skill_id: skill.id } : {}),
        agent_id: agent.id,
        outcome: result.outcome,
        cost_usd: result.cost_usd,
      },
      singleRunLogLine(caseId, result.outcome, result.cost_usd, skill?.id),
    );
    return result;
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

    const owner: EvalOwner = { kind: 'agent', id: agent.id };
    const started = await repo.transaction(async (tx) => {
      await repo.lockOwner(tx, owner);
      if (await repo.getRunningSuite(workspaceId, owner, tx)) {
        throw new AppError('eval_run_in_progress', 'An eval run of this agent is already in progress', 409);
      }
      const cases = await repo.listCasesByOwner(workspaceId, owner, tx);
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
          ownerKind: 'agent',
          agentId: agent.id,
          agentVersion: agent.version,
          skillId: null,
          skillVersion: null,
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

  /**
   * Start a skill suite through a host agent (G1 AC-9, AC-10): 404 unknown/foreign
   * skill; 422 `host_not_found`; under the skill lock 409 `eval_run_in_progress`,
   * 422 `no_cases`, 422 `too_many_cases`. A disabled skill or host, or a host not
   * linked to the skill, still runs. The prompt holds ONLY this skill.
   */
  async startSkillSuite(
    workspaceId: string,
    skillId: string,
    hostAgentId: string,
    log?: PinoLike,
  ): Promise<EvalSuiteRun> {
    const { repo, agents } = this.deps;
    const skill = await this.requireSkill(workspaceId, skillId);
    const host = await agents.getById(workspaceId, hostAgentId);
    if (!host) throw new AppError('host_not_found', 'The host agent was not found', 422);

    const owner: EvalOwner = { kind: 'skill', id: skill.id };
    const started = await repo.transaction(async (tx) => {
      await repo.lockOwner(tx, owner);
      if (await repo.getRunningSuite(workspaceId, owner, tx)) {
        throw new AppError('eval_run_in_progress', 'An eval run of this skill is already in progress', 409);
      }
      const cases = await repo.listCasesByOwner(workspaceId, owner, tx);
      if (cases.length === 0) {
        throw new AppError('no_cases', 'This skill has no eval cases yet', 422);
      }
      if (cases.length > EVAL_MAX_CASES) {
        throw new AppError(
          'too_many_cases',
          `An eval suite runs at most ${EVAL_MAX_CASES} cases; this skill has ${cases.length}`,
          422,
        );
      }
      const suite = await repo.insertSuiteRun(
        {
          workspaceId,
          ownerKind: 'skill',
          agentId: host.id,
          agentVersion: host.version,
          skillId: skill.id,
          skillVersion: skill.version,
          caseIds: cases.map((c) => c.id),
          skills: [skill.name],
        },
        tx,
      );
      if (!suite) {
        throw new AppError('eval_run_in_progress', 'An eval run of this skill is already in progress', 409);
      }
      return { suite, cases };
    });

    const executor = new EvalSuiteExecutor({ repo, llmSingleShot: this.deps.llmSingleShot });
    void executor
      .execute({
        suite: started.suite,
        agent: { provider: host.provider, model: host.model, systemPrompt: host.systemPrompt },
        skillBlocks: [evalSkillBlock(skill)],
        cases: started.cases,
        ...(log ? { log } : {}),
      })
      .catch(() => undefined);
    return toEvalSuiteRun(started.suite);
  }

  /** At most 50 suites of the skill, newest first; 404 for an unknown or foreign skill. */
  async listSkillSuites(workspaceId: string, skillId: string): Promise<EvalSuiteRun[]> {
    await this.requireSkill(workspaceId, skillId);
    const rows = await this.deps.repo.listSuitesBySkill(workspaceId, skillId, EVAL_HISTORY_LIMIT);
    return rows.map(toEvalSuiteRun);
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
