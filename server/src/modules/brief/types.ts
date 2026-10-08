import type {
  BlastRadius,
  BriefMissingInput,
  BriefTruncatedInput,
  Intent,
  IntentRiskArea,
  SmartDiffRole,
} from '@devdigest/shared';

/** One changed file as the model sees it: path, role, counts. Never the patch. */
export interface BriefFileFact {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  /** Start lines of the PR's non-dismissed findings in this file. */
  findingLines: number[];
}

/** Intent as the brief uses it (the stored PrIntent minus provenance). */
export interface BriefIntentFact extends Intent {
  risk_areas: IntentRiskArea[];
}

export interface BriefIssueFact {
  ref: string;
  title: string;
  body: string;
}

export interface BriefContextDoc {
  path: string;
  content: string;
}

/** Totals of the whole change; kept even when file stats are cut (never-cut core). */
export interface BriefTotals {
  files: number;
  additions: number;
  deletions: number;
}

/** Everything the brief prompt is built from. Pure data, no patch text. */
export interface BriefFacts {
  title: string;
  description: string | null;
  intent: BriefIntentFact | null;
  /** true = the intent was derived for an earlier head. */
  intentStale: boolean;
  /** Callers inside `downstream` are ordered best-ranked first. */
  blast: BlastRadius | null;
  files: BriefFileFact[];
  totals: BriefTotals;
  linkedIssue: BriefIssueFact | null;
  /** Attach order: first attached first. */
  contextDocs: BriefContextDoc[];
}

export interface FittedBrief {
  facts: BriefFacts;
  truncated: BriefTruncatedInput[];
  /** `ceil(chars / 4)` of the assembled messages. */
  tokens: number;
}

/** Structural subset of repo-intel's `BlastResult` (so no cross-module import). */
export interface BlastResultInput {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: string;
}

export interface GroundingContext {
  /** Paths of the PR's changed files. */
  prFiles: string[];
  blast: BlastRadius | null;
  intent: BriefIntentFact | null;
  /** Smart Diff finding lines per path. */
  findingLines: Map<string, number[]>;
}

export interface GroundingDropped {
  /** `file_refs` entries removed (not in the PR or blast map). */
  refs: number;
  /** Risks removed because no `file_refs` were left. */
  risks: number;
  /** Review-focus items removed (file not in the PR or blast map). */
  focus: number;
  /** Focus items kept but whose `line` was set to null. */
  linesNulled: number;
}

export interface MissingInputsContext {
  hasIntent: boolean;
  /** Blast is degraded and found no changed symbols (C-5). */
  blastMissing: boolean;
  changedFileCount: number;
  issueReferenced: boolean;
  issueRead: boolean;
  docsAttached: number;
  /** Documents that were read successfully (before any budget cut). */
  docsRead: number;
}

export type { BriefMissingInput };
