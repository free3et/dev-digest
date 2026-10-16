import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  check,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
});

/**
 * One suite run: every case of an agent, run once, aggregated. `agent_id` has
 * no FK on purpose (a deleted agent's suite runs are not cleaned up, spec A
 * NG-10). At most one `running` suite per agent, enforced by a partial unique
 * index. Aggregate metrics are null while running or when a denominator is 0.
 */
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull(),
    /** The agent's version when the run started. */
    agentVersion: integer('agent_version').notNull(),
    status: text('status', { enum: ['running', 'done', 'partial', 'failed'] })
      .notNull()
      .default('running'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** The case set frozen at start, in name order. */
    caseIds: jsonb('case_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Enabled skill names in prompt order at start. */
    skills: jsonb('skills').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    casesTotal: integer('cases_total').notNull().default(0),
    casesCompleted: integer('cases_completed').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    /** Sum of non-null per-case costs; null when all are null. */
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    /** Reason for `failed`. */
    error: text('error'),
  },
  (t) => [
    check('eval_suite_runs_status_check', sql`${t.status} IN ('running','done','partial','failed')`),
    index('eval_suite_runs_agent_ran_at_idx').on(t.agentId, t.ranAt),
    index('eval_suite_runs_workspace_id_idx').on(t.workspaceId),
    uniqueIndex('eval_suite_runs_agent_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  ],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    /** Null only for a per-case run outside a suite. */
    suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => [index('eval_runs_suite_run_id_idx').on(t.suiteRunId)],
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
