import type {
  EvalActualOutput,
  EvalCaseDraft,
  EvalCaseOutcome,
  EvalExpectation,
  EvalExpectationKind,
  EvalSuiteRun,
  EvalSuiteStatus,
  Provider,
} from '@devdigest/shared';

/** The part of an expectation scoring reads (spec A Scoring rules). */
export interface ExpectationLocation {
  kind: EvalExpectationKind;
  file: string;
  start_line: number;
  end_line: number;
}

/** Any expectation-shaped value (the full `EvalExpectation` fits). */
export type ScoringExpectation = ExpectationLocation | EvalExpectation;

/** The scored result of one case: the stored output plus the per-case metrics. */
export interface CaseResult {
  /** What goes into `eval_runs.actual_output`. */
  output: EvalActualOutput;
  outcome: EvalCaseOutcome;
  /** null = `error`. */
  pass: boolean | null;
  matched: boolean | null;
  findings_kept: number | null;
  findings_dropped: number | null;
  /** Kept findings that match a `must_find` expectation; 0 for `must_not_flag`; null on `error`. */
  matching_kept: number | null;
  /** 1 / 0 for a completed `must_find` case; null otherwise. */
  recall: number | null;
  /** matching / kept; null when no finding was kept or the case errored. */
  precision: number | null;
  /** kept / (kept + dropped); null when no candidate or the case errored. */
  citation_accuracy: number | null;
}

/** One stored case run as the aggregator reads it. */
export interface StoredCaseRun {
  expectation: ScoringExpectation;
  output: EvalActualOutput;
  cost_usd: number | null;
}

export interface SuiteAggregate {
  status: Exclude<EvalSuiteStatus, 'running'>;
  cases_total: number;
  /** Cases that returned an answer (non-errored). The denominators use this set. */
  cases_completed: number;
  cases_passed: number;
  cases_errored: number;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cost_usd: number | null;
  /** Reason for `failed`, else null. */
  error: string | null;
}

/** One agent with cases, as `dashboardRows` reads it (the repository builds this). */
export interface DashboardAgentInput {
  agent_id: string;
  agent_name: string;
  cases_total: number;
  /** Finished (`done` / `partial`) suites of the agent; order does not matter. */
  finished: EvalSuiteRun[];
  running: boolean;
}

/** Everything case creation reads about a finding (repository → service). */
export interface FindingScope {
  finding_id: string;
  file: string;
  start_line: number;
  end_line: number;
  severity: string;
  category: string;
  title: string;
  accepted_at: Date | null;
  dismissed_at: Date | null;
  review_id: string;
  /** null when the review has no agent. */
  agent_id: string | null;
  run_id: string | null;
  pr_id: string;
  pr_number: number;
  pr_title: string;
  pr_body: string | null;
  head_sha: string;
  /** "owner/name" */
  repo: string;
  /** Persisted `pr_files.patch` of the finding's file; null / empty = unavailable. */
  patch: string | null;
}

/** The agent fields a case derivation / dry-run reads. */
export interface DerivedAgent {
  id: string;
  version: number;
  provider: Provider;
  model: string;
  systemPrompt: string;
}

/**
 * Everything one derivation of a case from a finding yields (Spec C). Draft,
 * dry-run and create all read it, so a draft equals a bodiless save by
 * construction.
 */
export interface DerivedCase {
  scope: FindingScope;
  /** The finding's decision read in the same snapshot as `scope`. */
  kind: EvalExpectationKind;
  agent: DerivedAgent;
  /** What a bodiless save would store (minus `source`). */
  draft: EvalCaseDraft;
  /** Full expectation with the server-built `source`. */
  expectation: EvalExpectation;
}
