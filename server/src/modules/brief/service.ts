import {
  BriefModelOutput,
  CONTEXT_DOC_MAX_BYTES,
  type BlastRadius,
  type FeatureModelChoice,
  type PrBrief,
  type PrBriefResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PinoLike as Logger } from '../../platform/run-logger.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BriefRepository, type BriefRepo, type PullScope } from './repository.js';
import {
  BRIEF_FEATURE_ID,
  BRIEF_SCHEMA_NAME,
  ISSUE_FETCH_TIMEOUT_MS,
  LLM_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
} from './constants.js';
import {
  buildBriefMessages,
  classifyFile,
  computeMissingInputs,
  computeTotals,
  extractIssueRefs,
  findingLinesByPath,
  callerRankKey,
  fitBudget,
  groundBrief,
  isBlastMissing,
  isSpecsDoc,
  isStale,
  pickLatestReviewPerAgent,
  toBlastRadius,
} from './helpers.js';
import type { BlastResultInput, BriefContextDoc, BriefFacts, BriefIssueFact } from './types.js';

/** The ports the brief reads, all obtained from the container. */
export type BriefContainer = Pick<
  Container,
  'reviewRepo' | 'repoIntel' | 'contextDocs' | 'contextDocLinksRepo' | 'agentsRepo' | 'llm' | 'github' | 'config'
>;

export interface BriefDeps {
  repo: BriefRepo;
  container: BriefContainer;
  /** Workspace override or registry default for `risk_brief`. */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
}

export interface BriefOptions {
  llmTimeoutMs?: number;
  issueTimeoutMs?: number;
}

/** AC-25: PRs with a generation in progress in this process (C-28). Released in `finally`. */
const inFlight = new Set<string>();

// duplicated from server/src/modules/reviews/intent-deriver.ts (platform/resilience.ts has no `what` label)
class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

// duplicated from server/src/modules/reviews/intent-deriver.ts (platform/resilience.ts has no `what` label)
async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const unavailable = (message = 'PR brief could not be generated') =>
  new AppError('brief_unavailable', message, 409);

/**
 * brief service. `get` is a pure read (never calls an LLM); `generate` gathers
 * the facts, makes ONE structured LLM call, grounds the output and upserts it.
 */
export class BriefService {
  private llmTimeoutMs: number;
  private issueTimeoutMs: number;

  constructor(
    private deps: BriefDeps,
    opts: BriefOptions = {},
  ) {
    this.llmTimeoutMs = opts.llmTimeoutMs ?? LLM_TIMEOUT_MS;
    this.issueTimeoutMs = opts.issueTimeoutMs ?? ISSUE_FETCH_TIMEOUT_MS;
  }

  static fromContainer(container: Container, opts: BriefOptions = {}): BriefService {
    return new BriefService(
      {
        repo: new BriefRepository(container.db),
        container,
        resolveModel: (workspaceId) => resolveFeatureModel(container, workspaceId, BRIEF_FEATURE_ID),
      },
      opts,
    );
  }

  /** The stored brief (or null) and whether the PR head moved since. No LLM. */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const scope = await this.deps.repo.getPullScope(workspaceId, prId);
    if (!scope) throw new NotFoundError('Pull request not found');
    const brief = await this.deps.repo.getBrief(prId);
    if (!brief) return { brief: null, stale: false };
    return { brief, stale: isStale(brief.head_sha, scope.headSha) };
  }

  /** Generate (or regenerate) the brief. 409 `brief_in_progress` / `brief_unavailable`. */
  async generate(workspaceId: string, prId: string, log?: Logger): Promise<PrBrief> {
    const scope = await this.deps.repo.getPullScope(workspaceId, prId);
    if (!scope) throw new NotFoundError('Pull request not found');
    // Check and add are synchronous together: a concurrent call sees the entry.
    if (inFlight.has(prId)) throw new AppError('brief_in_progress', 'A brief is already being generated', 409);
    inFlight.add(prId);
    const state = { cancelled: false };
    const started = Date.now();
    try {
      return await withTimeout(this.run(workspaceId, scope, state, started, log), this.llmTimeoutMs, 'PR brief');
    } catch (err) {
      // The LLM port has no abort signal: a late result must never be persisted.
      state.cancelled = true;
      if (err instanceof AppError && err.code.startsWith('brief_')) throw err;
      // Error message only, never PR text.
      log?.warn({ prId, err: (err as Error).message }, 'pr brief failed');
      throw unavailable();
    } finally {
      inFlight.delete(prId);
    }
  }

  private async run(
    workspaceId: string,
    scope: PullScope,
    state: { cancelled: boolean },
    started: number,
    log?: Logger,
  ): Promise<PrBrief> {
    const { container } = this.deps;
    const prId = scope.id;
    const headSha = scope.headSha; // read once at start (AC-3)

    // ---- stored inputs ---------------------------------------------------
    const [intentRow, prFiles, reviewRows, commits] = await Promise.all([
      container.reviewRepo.getIntent(prId),
      container.reviewRepo.getPrFiles(prId),
      container.reviewRepo.reviewsForPull(prId),
      container.reviewRepo.getPrCommits(prId),
    ]);
    const latest = new Set(pickLatestReviewPerAgent(reviewRows.map((r) => r.review)).map((r) => r.id));
    const findingLines = findingLinesByPath(
      reviewRows.filter((r) => latest.has(r.review.id)).flatMap((r) => r.findings),
    );
    // Totals come from the full file list, before any budget cut.
    const totals = computeTotals(prFiles);
    const files = prFiles.map((f) => ({
      path: f.path,
      role: classifyFile(f.path),
      additions: f.additions,
      deletions: f.deletions,
      findingLines: findingLines.get(f.path) ?? [],
    }));

    const intent = intentRow
      ? {
          intent: intentRow.intent,
          in_scope: intentRow.inScope,
          out_of_scope: intentRow.outOfScope,
          risk_areas: intentRow.riskAreas,
        }
      : null;

    // ---- blast radius ----------------------------------------------------
    let blast: BlastRadius | null = null;
    let blastMissing = true;
    let callerOrder: string[] = [];
    try {
      const result = (await container.repoIntel.getBlastRadius(
        scope.repoId,
        prFiles.map((f) => f.path),
      )) as BlastResultInput;
      blastMissing = isBlastMissing(result);
      if (!blastMissing) {
        // Callers best-ranked first (stable): the budget cut removes from the end.
        const callers = result.callers.map((c, i) => ({ c, i })).sort((a, b) => b.c.rank - a.c.rank || a.i - b.i).map((x) => x.c);
        callerOrder = callers.map((c) => callerRankKey(c.viaSymbol, c.file, c.symbol));
        blast = toBlastRadius({ ...result, callers });
      }
    } catch {
      blast = null;
      blastMissing = true;
    }

    // ---- linked issue (one live fetch, C-26) -----------------------------
    const refs = extractIssueRefs([scope.body ?? '', ...commits.map((c) => c.message)], {
      owner: scope.owner,
      name: scope.name,
    });
    const issueReferenced = refs.length > 0;
    const linkedIssue = issueReferenced ? await this.fetchIssue(scope, refs[0]!.number) : null;

    // ---- Project Context specs documents --------------------------------
    const { docs, attached } = await this.readContextDocs(workspaceId, scope);

    // ---- budget + prompt -------------------------------------------------
    const facts: BriefFacts = {
      title: scope.title,
      description: scope.body && scope.body.trim() ? scope.body : null,
      intent,
      intentStale: intentRow ? intentRow.headSha !== headSha : false,
      blast,
      files,
      totals,
      linkedIssue,
      contextDocs: docs,
    };
    const fitted = fitBudget(facts, undefined, callerOrder);
    const messages = buildBriefMessages(fitted.facts);

    // ---- the one LLM call ------------------------------------------------
    const choice = await this.deps.resolveModel(workspaceId);
    const llm = await container.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: BriefModelOutput,
      schemaName: BRIEF_SCHEMA_NAME,
      temperature: 0,
      messages,
      maxRetries: 0,
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: LLM_TIMEOUT_MS,
    });

    // A timed-out call still completes (and is billed); never persist its result.
    if (state.cancelled) throw unavailable();

    const grounded = groundBrief(res.data, {
      prFiles: prFiles.map((f) => f.path),
      blast,
      intent,
      findingLines,
    });
    const brief: PrBrief = {
      summary: res.data.summary,
      risks: grounded.risks,
      review_focus: grounded.review_focus,
      intent: intent ? { intent: intent.intent, in_scope: intent.in_scope, out_of_scope: intent.out_of_scope } : null,
      blast,
      head_sha: headSha,
      generated_at: new Date().toISOString(),
      model: res.model,
      cost_usd: res.costUsd,
      missing_inputs: computeMissingInputs({
        hasIntent: intentRow !== undefined,
        blastMissing,
        changedFileCount: prFiles.length,
        issueReferenced,
        issueRead: linkedIssue !== null,
        docsAttached: attached,
        docsRead: docs.length,
      }),
      intent_stale: facts.intentStale,
      truncated_inputs: fitted.truncated,
    };
    if (state.cancelled) throw unavailable();
    await this.deps.repo.upsertBrief(prId, brief);

    // One line, no PR text (NFR-6).
    log?.info(
      {
        prId,
        model: `${choice.provider}/${res.model}`,
        cost_usd: res.costUsd,
        input_tokens: fitted.tokens,
        tokens_out: res.tokensOut,
        risks: brief.risks.risks.length,
        review_focus: brief.review_focus.length,
        missing_inputs: brief.missing_inputs,
        truncated_inputs: brief.truncated_inputs,
        dropped: grounded.dropped,
        ms: Date.now() - started,
      },
      'pr brief generated',
    );
    return brief;
  }

  /** First same-repo issue, bounded by the issue timeout; any failure (or no token) => null. */
  private async fetchIssue(scope: PullScope, n: number): Promise<BriefIssueFact | null> {
    try {
      const gh = await this.deps.container.github();
      const meta = await withTimeout(
        gh.getIssue({ owner: scope.owner, name: scope.name }, n),
        this.issueTimeoutMs,
        'Issue fetch',
      );
      return { ref: `#${n}`, title: meta.title, body: meta.body ?? '' };
    } catch {
      return null;
    }
  }

  /**
   * Union over enabled agents of their own + skill-inherited attachments for the
   * repo, specs documents only, de-duplicated (first wins), read like the run
   * executor does. `attached` counts the paths; `docs` only the ones read.
   */
  private async readContextDocs(
    workspaceId: string,
    scope: PullScope,
  ): Promise<{ docs: BriefContextDoc[]; attached: number }> {
    const { container } = this.deps;
    const paths: string[] = [];
    try {
      const agents = await container.agentsRepo.listEnabled(workspaceId);
      for (const a of agents) {
        const [own, inherited] = await Promise.all([
          container.contextDocLinksRepo.agentDocs(a.id, scope.repoId),
          container.contextDocLinksRepo.inheritedDocs(a.id, scope.repoId),
        ]);
        for (const p of [...own, ...inherited.map((l) => l.path)]) {
          if (isSpecsDoc(p) && !paths.includes(p)) paths.push(p);
        }
      }
    } catch {
      return { docs: [], attached: 0 };
    }
    const clonePath = await this.clonePath(scope.repoId);
    const docs: BriefContextDoc[] = [];
    for (const path of paths) {
      try {
        if (!clonePath) continue;
        const abs = await container.contextDocs.resolve(clonePath, path, container.config.contextRoots);
        if (!abs) continue;
        if ((await container.contextDocs.size(abs)) > CONTEXT_DOC_MAX_BYTES) continue;
        const bytes = await container.contextDocs.read(abs);
        if (bytes.length > CONTEXT_DOC_MAX_BYTES) continue;
        docs.push({ path, content: bytes.toString('utf8') });
      } catch {
        /* unreadable => counted as missing */
      }
    }
    return { docs, attached: paths.length };
  }

  private async clonePath(repoId: string): Promise<string | null> {
    const repo = await this.deps.container.reviewRepo.getRepo(repoId);
    return repo?.clonePath ?? null;
  }
}
