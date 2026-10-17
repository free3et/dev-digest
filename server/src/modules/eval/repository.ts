import { and, asc, desc, eq, getTableColumns, inArray, lte, sql } from 'drizzle-orm';
import type { EvalCaseOutcome, EvalExpectation, EvalSuiteStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseRow, EvalRunRow, EvalSuiteRunRow } from '../../db/rows.js';
import { EVAL_HISTORY_LIMIT } from './constants.js';
import { toEvalSuiteRun } from './helpers.js';
import type { DashboardAgentInput, FindingScope } from './types.js';

/**
 * eval data-access layer. The ONLY file in this module that touches the DB.
 *
 * Every method takes an optional `tx`: pass the one the service opened so the
 * write joins its transaction (a call without it runs on the pool, outside it).
 * The two lock methods REQUIRE a tx, a transaction-scoped advisory lock means
 * nothing outside one.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

export interface NewCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: unknown;
  expectedOutput: unknown;
}

export interface NewSuiteRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  caseIds: string[];
  skills: string[];
}

export interface NewCaseRun {
  caseId: string;
  suiteRunId: string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

/** Final state of a suite (from `helpers.aggregateSuite`). */
export interface SuiteFinal {
  status: Exclude<EvalSuiteStatus, 'running'>;
  casesTotal: number;
  casesCompleted: number;
  casesPassed: number;
  casesErrored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  error: string | null;
}

export interface SuiteDetailRow {
  run: EvalRunRow;
  caseName: string;
  /** The case's expectation, for re-scoring through `helpers.aggregateSuite`. */
  expectedOutput: unknown;
}

export class EvalRepository {
  constructor(private db: Db) {}

  private c(tx?: Tx): Conn {
    return tx ?? this.db;
  }

  /** Open a transaction; the SERVICE owns the boundary and passes `tx` to every call. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  // ------------------------------------------------------------ locks

  /** Serialises concurrent case creation for one finding until the tx ends. */
  async lockFinding(tx: Tx, findingId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`eval-finding:${findingId}`}))`);
  }

  /** Serialises suite start / case delete for one agent until the tx ends. */
  async lockAgent(tx: Tx, agentId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`eval-agent:${agentId}`}))`);
  }

  // ------------------------------------------------------------ cases

  /** Finding + review + PR + repo + the persisted patch of its file; workspace-scoped. */
  async getFindingScope(
    workspaceId: string,
    findingId: string,
    tx?: Tx,
  ): Promise<FindingScope | undefined> {
    const db = this.c(tx);
    const [row] = await db
      .select({
        finding_id: t.findings.id,
        file: t.findings.file,
        start_line: t.findings.startLine,
        end_line: t.findings.endLine,
        severity: t.findings.severity,
        category: t.findings.category,
        title: t.findings.title,
        accepted_at: t.findings.acceptedAt,
        dismissed_at: t.findings.dismissedAt,
        review_id: t.reviews.id,
        agent_id: t.reviews.agentId,
        run_id: t.reviews.runId,
        pr_id: t.pullRequests.id,
        pr_number: t.pullRequests.number,
        pr_title: t.pullRequests.title,
        pr_body: t.pullRequests.body,
        head_sha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)));
    if (!row) return undefined;

    const [file] = await db
      .select({ patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, row.pr_id), eq(t.prFiles.path, row.file)))
      .limit(1);

    const { owner, name, ...rest } = row;
    return { ...rest, repo: `${owner}/${name}`, patch: file?.patch ?? null };
  }

  /** The case frozen from this finding (`expected_output.source.finding_id`), if any. */
  async findCaseBySourceFinding(
    workspaceId: string,
    findingId: string,
    tx?: Tx,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.c(tx)
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          sql`${t.evalCases.expectedOutput} -> 'source' ->> 'finding_id' = ${findingId}`,
        ),
      )
      .limit(1);
    return row;
  }

  async insertCase(values: NewCase, tx?: Tx): Promise<EvalCaseRow> {
    const [row] = await this.c(tx)
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: 'agent',
        ownerId: values.agentId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputFiles: values.inputFiles,
        inputMeta: values.inputMeta,
        expectedOutput: values.expectedOutput,
        notes: null,
      })
      .returning();
    return row!;
  }

  /** An agent's cases, `ORDER BY name` (id as the tie-break). */
  async listCasesByAgent(workspaceId: string, agentId: string, tx?: Tx): Promise<EvalCaseRow[]> {
    return this.c(tx)
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(asc(t.evalCases.name), asc(t.evalCases.id));
  }

  async getCase(workspaceId: string, id: string, tx?: Tx): Promise<EvalCaseRow | undefined> {
    const [row] = await this.c(tx)
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  /** Rewrites the editable fields of a case; the frozen input is never touched. */
  async updateCase(
    workspaceId: string,
    id: string,
    values: { name: string; expectedOutput: EvalExpectation },
    tx?: Tx,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.c(tx)
      .update(t.evalCases)
      .set({ name: values.name, expectedOutput: values.expectedOutput })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  /** Cascades to the case's `eval_runs`; stored suite aggregates are untouched. */
  async deleteCase(workspaceId: string, id: string, tx?: Tx): Promise<boolean> {
    const rows = await this.c(tx)
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  // ------------------------------------------------------------ suites

  /**
   * Insert a `running` suite. The partial unique index
   * `eval_suite_runs_agent_running_uq` allows one per agent; a conflict returns
   * `null` ("already running") instead of throwing, because a unique violation
   * would abort the caller's transaction.
   */
  async insertSuiteRun(values: NewSuiteRun, tx?: Tx): Promise<EvalSuiteRunRow | null> {
    const rows = await this.c(tx)
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        agentVersion: values.agentVersion,
        status: 'running',
        caseIds: values.caseIds,
        skills: values.skills,
        casesTotal: values.caseIds.length,
      })
      .onConflictDoNothing({
        target: t.evalSuiteRuns.agentId,
        where: sql`${t.evalSuiteRuns.status} = 'running'`,
      })
      .returning();
    return rows[0] ?? null;
  }

  async getRunningSuite(
    workspaceId: string,
    agentId: string,
    tx?: Tx,
  ): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.c(tx)
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    return row;
  }

  /**
   * Live progress after one case. `outcome` picks the counters:
   *  - `passed` / `failed`: `cases_completed` +1 (an answered case), and
   *    `cases_passed` +1 for `passed`;
   *  - `error`: `cases_errored` +1.
   * FINISHED cases (what "k / n" shows) are therefore
   * `cases_completed + cases_errored`; `cases_completed` alone keeps the
   * Scoring-rules meaning (non-errored) that `aggregateSuite` ends with.
   */
  async bumpProgress(suiteId: string, outcome: EvalCaseOutcome, tx?: Tx): Promise<void> {
    const answered = outcome === 'error' ? 0 : 1;
    const passed = outcome === 'passed' ? 1 : 0;
    const errored = outcome === 'error' ? 1 : 0;
    await this.c(tx)
      .update(t.evalSuiteRuns)
      .set({
        casesCompleted: sql`${t.evalSuiteRuns.casesCompleted} + ${answered}`,
        casesPassed: sql`${t.evalSuiteRuns.casesPassed} + ${passed}`,
        casesErrored: sql`${t.evalSuiteRuns.casesErrored} + ${errored}`,
      })
      .where(and(eq(t.evalSuiteRuns.id, suiteId), eq(t.evalSuiteRuns.status, 'running')));
  }

  /** `running` -> final state; duration is `now() - ran_at`. No-op for a finished suite. */
  async finalizeSuite(suiteId: string, final: SuiteFinal, tx?: Tx): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.c(tx)
      .update(t.evalSuiteRuns)
      .set({
        status: final.status,
        finishedAt: sql`now()`,
        durationMs: sql`floor(extract(epoch from (now() - ${t.evalSuiteRuns.ranAt})) * 1000)::int`,
        casesTotal: final.casesTotal,
        casesCompleted: final.casesCompleted,
        casesPassed: final.casesPassed,
        casesErrored: final.casesErrored,
        recall: final.recall,
        precision: final.precision,
        citationAccuracy: final.citationAccuracy,
        costUsd: final.costUsd,
        error: final.error,
      })
      .where(and(eq(t.evalSuiteRuns.id, suiteId), eq(t.evalSuiteRuns.status, 'running')))
      .returning();
    return row;
  }

  async insertCaseRun(values: NewCaseRun, tx?: Tx): Promise<EvalRunRow> {
    const [row] = await this.c(tx).insert(t.evalRuns).values(values).returning();
    return row!;
  }

  async getSuite(workspaceId: string, id: string, tx?: Tx): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.c(tx)
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row;
  }

  /**
   * The suite plus one run per case that still exists, in `case_ids` order,
   * each with its case name and expectation.
   */
  async getSuiteDetail(
    workspaceId: string,
    id: string,
    tx?: Tx,
  ): Promise<{ suite: EvalSuiteRunRow; runs: SuiteDetailRow[] } | undefined> {
    const suite = await this.getSuite(workspaceId, id, tx);
    if (!suite) return undefined;
    const rows = await this.c(tx)
      .select({
        run: getTableColumns(t.evalRuns),
        caseName: t.evalCases.name,
        expectedOutput: t.evalCases.expectedOutput,
      })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(eq(t.evalRuns.suiteRunId, id));
    const order = new Map(suite.caseIds.map((cid, i) => [cid, i]));
    rows.sort(
      (a, b) =>
        (order.get(a.run.caseId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.run.caseId) ?? Number.MAX_SAFE_INTEGER),
    );
    return { suite, runs: rows };
  }

  /** Newest first, at most `limit` (default 50). */
  async listSuitesByAgent(
    workspaceId: string,
    agentId: string,
    limit: number = EVAL_HISTORY_LIMIT,
    tx?: Tx,
  ): Promise<EvalSuiteRunRow[]> {
    return this.c(tx)
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.agentId, agentId)))
      .orderBy(desc(t.evalSuiteRuns.ranAt), desc(t.evalSuiteRuns.id))
      .limit(limit);
  }

  /**
   * Finished (`done` / `partial`) suites of every agent of the workspace,
   * newest first, at most `limit`. The inner join on `agents` (scoped to the
   * workspace on BOTH sides) drops runs of deleted or foreign agents and
   * carries the agent's current name.
   */
  async listRecentFinishedSuites(
    workspaceId: string,
    limit: number,
    tx?: Tx,
  ): Promise<{ suite: EvalSuiteRunRow; agentName: string }[]> {
    return this.c(tx)
      .select({ suite: getTableColumns(t.evalSuiteRuns), agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(
        t.agents,
        and(eq(t.agents.id, t.evalSuiteRuns.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          inArray(t.evalSuiteRuns.status, ['done', 'partial']),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.ranAt), desc(t.evalSuiteRuns.id))
      .limit(limit);
  }

  /** Every `running` suite of every workspace (boot reaper). */
  async listRunningSuites(tx?: Tx): Promise<EvalSuiteRunRow[]> {
    return this.c(tx).select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.status, 'running'));
  }

  // ------------------------------------------------------------ dashboard

  /**
   * Agents of the workspace with >= 1 case that still exist (join `agents`),
   * their latest two finished (`done` / `partial`) suites and a running flag.
   * Ordering is `helpers.dashboardRows`' job.
   */
  async dashboardInputs(workspaceId: string, tx?: Tx): Promise<DashboardAgentInput[]> {
    const db = this.c(tx);
    const agentRows = await db
      .select({
        agent_id: t.agents.id,
        agent_name: t.agents.name,
        cases_total: sql<number>`count(${t.evalCases.id})::int`,
      })
      .from(t.evalCases)
      .innerJoin(t.agents, and(eq(t.agents.id, t.evalCases.ownerId), eq(t.agents.workspaceId, workspaceId)))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.agents.id, t.agents.name);
    if (agentRows.length === 0) return [];
    const agentIds = agentRows.map((a) => a.agent_id);

    const ranked = db
      .select({
        id: t.evalSuiteRuns.id,
        rn: sql<number>`row_number() over (partition by ${t.evalSuiteRuns.agentId} order by ${t.evalSuiteRuns.ranAt} desc, ${t.evalSuiteRuns.id} desc)`.as(
          'rn',
        ),
      })
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          inArray(t.evalSuiteRuns.agentId, agentIds),
          inArray(t.evalSuiteRuns.status, ['done', 'partial']),
        ),
      )
      .as('ranked');
    const finished = await db
      .select(getTableColumns(t.evalSuiteRuns))
      .from(t.evalSuiteRuns)
      .innerJoin(ranked, eq(ranked.id, t.evalSuiteRuns.id))
      .where(lte(ranked.rn, 2));

    const runningRows = await db
      .selectDistinct({ agentId: t.evalSuiteRuns.agentId })
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          inArray(t.evalSuiteRuns.agentId, agentIds),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    const running = new Set(runningRows.map((r) => r.agentId));

    const byAgent = new Map<string, EvalSuiteRunRow[]>();
    for (const s of finished) {
      const list = byAgent.get(s.agentId) ?? [];
      list.push(s);
      byAgent.set(s.agentId, list);
    }
    return agentRows.map((a) => ({
      agent_id: a.agent_id,
      agent_name: a.agent_name,
      cases_total: a.cases_total,
      finished: (byAgent.get(a.agent_id) ?? []).map(toEvalSuiteRun),
      running: running.has(a.agent_id),
    }));
  }
}
