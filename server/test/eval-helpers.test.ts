import { describe, it, expect } from 'vitest';
import type { EvalActualOutput, EvalSuiteRun, Finding } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { diffFromPrFiles } from '../src/modules/reviews/diff-loader.js';
import { taskLine, toSkillPromptBlock } from '../src/modules/reviews/helpers.js';
import {
  aggregateSuite,
  buildCaseName,
  buildSingleFileDiff,
  dashboardRows,
  errorCase,
  evalSkillBlock,
  evalTaskLine,
  hostRefusal,
  matches,
  rescoreCase,
  scoreCase,
  singleRunLogLine,
  suiteLogLine,
  toEvalCase,
  toEvalRecentRun,
  toEvalRunRecord,
  toEvalSuiteRun,
  truncateError,
} from '../src/modules/eval/helpers.js';
import {
  EVAL_CASE_TIMEOUT_MS,
  EVAL_ERROR_MAX,
  EVAL_MAX_CASES,
  EVAL_MAX_OUTPUT_TOKENS,
} from '../src/modules/eval/constants.js';
import type { StoredCaseRun } from '../src/modules/eval/types.js';

function f(file: string, start: number, end = start, extra: Partial<Finding> = {}): Finding {
  return {
    id: `${file}:${start}-${end}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'a finding',
    file,
    start_line: start,
    end_line: end,
    rationale: 'because',
    confidence: 0.8,
    kind: 'finding',
    ...extra,
  };
}

const exp = (kind: 'must_find' | 'must_not_flag', file: string, s: number, e = s) => ({
  kind,
  file,
  start_line: s,
  end_line: e,
});

describe('matches (exact path, closed ranges, tolerance 0)', () => {
  const e = exp('must_find', 'a.ts', 10, 12);
  it('matches an inside, covering and boundary-touching range', () => {
    expect(matches(f('a.ts', 11), e)).toBe(true);
    expect(matches(f('a.ts', 1, 100), e)).toBe(true);
    expect(matches(f('a.ts', 12, 15), e)).toBe(true);
    expect(matches(f('a.ts', 8, 10), e)).toBe(true);
  });
  it('does not match an adjacent range (tolerance 0) or another path', () => {
    expect(matches(f('a.ts', 13, 14), e)).toBe(false);
    expect(matches(f('a.ts', 8, 9), e)).toBe(false);
    expect(matches(f('src/a.ts', 11), e)).toBe(false);
    expect(matches(f('A.ts', 11), e)).toBe(false);
  });
});

describe('scoreCase', () => {
  it('must_find passes when >= 1 kept finding matches', () => {
    const r = scoreCase(exp('must_find', 'a.ts', 10, 12), [f('a.ts', 11), f('b.ts', 1)], []);
    expect(r).toMatchObject({
      outcome: 'passed',
      pass: true,
      matched: true,
      findings_kept: 2,
      findings_dropped: 0,
      matching_kept: 1,
      recall: 1,
      precision: 0.5,
      citation_accuracy: 1,
    });
  });

  it('must_find fails with no match; a dropped finding does not count as a match', () => {
    const r = scoreCase(
      exp('must_find', 'a.ts', 10),
      [f('a.ts', 99)],
      [{ finding: f('a.ts', 10), reason: 'line not in diff' }],
    );
    expect(r).toMatchObject({ outcome: 'failed', pass: false, matched: false, recall: 0, precision: 0 });
    expect(r.citation_accuracy).toBe(0.5);
  });

  it('must_not_flag passes with no intersecting kept finding, fails otherwise', () => {
    const ok = scoreCase(exp('must_not_flag', 'a.ts', 10), [f('a.ts', 50)], []);
    expect(ok).toMatchObject({ pass: true, matched: false, recall: null });
    const bad = scoreCase(exp('must_not_flag', 'a.ts', 10), [f('a.ts', 10)], []);
    expect(bad).toMatchObject({ pass: false, matched: true, matching_kept: 0, precision: 0 });
  });

  it('a full-file kind still has to intersect the lines to match (EC-19)', () => {
    const secret = f('a.ts', 1, 1, { kind: 'secret_leak' });
    expect(scoreCase(exp('must_find', 'a.ts', 40, 41), [secret], []).pass).toBe(false);
    expect(scoreCase(exp('must_find', 'a.ts', 1, 3), [secret], []).pass).toBe(true);
  });

  it('zero kept: precision null; zero candidates: citation null (EC-6)', () => {
    const r = scoreCase(exp('must_find', 'a.ts', 1), [], []);
    expect(r.precision).toBeNull();
    expect(r.citation_accuracy).toBeNull();
    const dropped = scoreCase(exp('must_find', 'a.ts', 1), [], [{ finding: f('x.ts', 1), reason: 'file not in diff' }]);
    expect(dropped.precision).toBeNull();
    expect(dropped.citation_accuracy).toBe(0);
  });

  it('errorCase: outcome error, pass null, every metric null, text cut', () => {
    const r = errorCase('must_find', 'x'.repeat(1000));
    expect(r).toMatchObject({
      outcome: 'error',
      pass: null,
      matched: null,
      findings_kept: null,
      findings_dropped: null,
      recall: null,
      precision: null,
      citation_accuracy: null,
    });
    expect(r.output.error!.length).toBeLessThanOrEqual(EVAL_ERROR_MAX);
    expect(r.output.kept).toEqual([]);
  });
});

/** The ≥ 8-case fixture of spec A AC-12 (both kinds, dropped citations, one error). */
function fixtureRuns(): StoredCaseRun[] {
  const mk = (
    e: ReturnType<typeof exp>,
    kept: Finding[],
    dropped: { finding: Finding; reason: string }[],
    cost: number | null,
  ): StoredCaseRun => {
    const output = scoreCase(e, kept, dropped).output;
    // Emulate the jsonb round trip.
    return { expectation: e, output: JSON.parse(JSON.stringify(output)), cost_usd: cost };
  };
  const drop = (file: string, line: number) => ({ finding: f(file, line), reason: 'line not in diff' });
  return [
    mk(exp('must_find', 'a.ts', 10, 12), [f('a.ts', 11), f('b.ts', 1)], [drop('a.ts', 900)], 0.01),
    mk(exp('must_find', 'a.ts', 20), [f('a.ts', 30)], [], 0.02),
    mk(exp('must_find', 'a.ts', 40, 45), [f('a.ts', 45, 47)], [], null),
    mk(exp('must_not_flag', 'a.ts', 50), [], [drop('a.ts', 1), drop('a.ts', 2)], null),
    mk(exp('must_not_flag', 'a.ts', 60, 62), [f('a.ts', 61)], [], null),
    mk(exp('must_not_flag', 'a.ts', 70), [], [], null),
    { expectation: exp('must_find', 'a.ts', 80), output: errorCase('must_find', 'timed out').output, cost_usd: null },
    mk(exp('must_find', 'a.ts', 90, 91), [f('a.ts', 90), f('a.ts', 91)], [], null),
  ];
}

describe('aggregateSuite', () => {
  it('computes every metric exactly and marks a run with one error partial', () => {
    const agg = aggregateSuite(fixtureRuns());
    expect(agg.status).toBe('partial');
    expect(agg.error).toBeNull();
    expect(agg.cases_total).toBe(8);
    expect(agg.cases_completed).toBe(7);
    expect(agg.cases_errored).toBe(1);
    expect(agg.cases_passed).toBe(5);
    expect(agg.recall).toBe(3 / 4);
    expect(agg.precision).toBe(4 / 7);
    expect(agg.citation_accuracy).toBe(7 / 10);
    expect(agg.cost_usd).toBeCloseTo(0.03, 10);
  });

  it('is done with no errored case and keeps null cost when every cost is null', () => {
    const runs = fixtureRuns().filter((r) => r.output.outcome !== 'error').map((r) => ({ ...r, cost_usd: null }));
    const agg = aggregateSuite(runs);
    expect(agg.status).toBe('done');
    expect(agg.cost_usd).toBeNull();
  });

  it('is failed with a reason when every case errored; all metrics null', () => {
    const runs: StoredCaseRun[] = [
      { expectation: exp('must_find', 'a.ts', 1), output: errorCase('must_find', 'boom').output, cost_usd: null },
      { expectation: exp('must_not_flag', 'a.ts', 2), output: errorCase('must_not_flag', 'boom').output, cost_usd: null },
    ];
    const agg = aggregateSuite(runs);
    expect(agg).toMatchObject({
      status: 'failed',
      cases_total: 2,
      cases_completed: 0,
      cases_errored: 2,
      recall: null,
      precision: null,
      citation_accuracy: null,
    });
    expect(agg.error).toContain('all 2 cases errored');
    expect(agg.error).toContain('boom');
  });

  it('only must_not_flag cases: recall is null, not 1 (EC-5)', () => {
    const e = exp('must_not_flag', 'a.ts', 5);
    const agg = aggregateSuite([
      { expectation: e, output: scoreCase(e, [], []).output, cost_usd: 0.001 },
    ]);
    expect(agg.recall).toBeNull();
    expect(agg.status).toBe('done');
    expect(agg.precision).toBeNull();
    expect(agg.citation_accuracy).toBeNull();
  });

  it('errored cases are excluded from every numerator and denominator', () => {
    const base = fixtureRuns().filter((r) => r.output.outcome !== 'error');
    const withError: StoredCaseRun[] = [
      ...base,
      { expectation: exp('must_find', 'z.ts', 1), output: errorCase('must_find', 'x').output, cost_usd: null },
    ];
    const a = aggregateSuite(base);
    const b = aggregateSuite(withError);
    expect([b.recall, b.precision, b.citation_accuracy]).toEqual([a.recall, a.precision, a.citation_accuracy]);
  });

  it('a must_not_flag hit is noise under strict precision: kept counts, matching does not', () => {
    const e = exp('must_not_flag', 'a.ts', 10);
    const agg = aggregateSuite([
      { expectation: e, output: scoreCase(e, [f('a.ts', 10), f('a.ts', 11)], []).output, cost_usd: null },
    ]);
    expect(agg).toMatchObject({
      status: 'done',
      cases_total: 1,
      cases_completed: 1,
      cases_passed: 0,
      recall: null,
      precision: 0,
      citation_accuracy: 1,
    });
  });

  it('a must_find case with zero kept findings fails: recall 0 while precision stays null', () => {
    const e = exp('must_find', 'a.ts', 10);
    const agg = aggregateSuite([{ expectation: e, output: scoreCase(e, [], []).output, cost_usd: null }]);
    expect(agg).toMatchObject({
      status: 'done',
      cases_passed: 0,
      recall: 0,
      precision: null,
      citation_accuracy: null,
    });
  });

  it('only dropped candidates: precision null (no kept), citation accuracy 0', () => {
    const e = exp('must_find', 'a.ts', 10);
    const output = scoreCase(e, [], [{ finding: f('a.ts', 999), reason: 'line not in diff' }]).output;
    const agg = aggregateSuite([{ expectation: e, output, cost_usd: null }]);
    expect(agg.precision).toBeNull();
    expect(agg.citation_accuracy).toBe(0);
    expect(agg.recall).toBe(0);
  });

  it('an empty suite is failed with "no cases ran" and all metrics null', () => {
    const agg = aggregateSuite([]);
    expect(agg).toMatchObject({
      status: 'failed',
      cases_total: 0,
      cases_completed: 0,
      cases_passed: 0,
      cases_errored: 0,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
      error: 'no cases ran',
    });
  });

  it('cost sums the errored cases too (they were still billed)', () => {
    const e = exp('must_find', 'a.ts', 1);
    const agg = aggregateSuite([
      { expectation: e, output: scoreCase(e, [f('a.ts', 1)], []).output, cost_usd: 0.25 },
      { expectation: e, output: errorCase('must_find', 'boom').output, cost_usd: 0.5 },
    ]);
    expect(agg.status).toBe('partial');
    expect(agg.cost_usd).toBeCloseTo(0.75, 10);
  });

  it('re-scoring the stored outputs is deterministic (NFR-8)', () => {
    const runs = fixtureRuns();
    const first = aggregateSuite(runs);
    expect(aggregateSuite(JSON.parse(JSON.stringify(runs)))).toEqual(first);
    for (const r of runs) {
      const again = rescoreCase(r.expectation, r.output);
      expect(again.output).toEqual(r.output);
    }
  });
});

describe('buildCaseName', () => {
  it('is `<file>:<line> <title>` with the title cut to 120 chars', () => {
    expect(buildCaseName('src/a.ts', 12, 'Short')).toBe('src/a.ts:12 Short');
    const name = buildCaseName('src/a.ts', 12, 'x'.repeat(300));
    expect(name).toBe(`src/a.ts:12 ${'x'.repeat(120)}`);
  });
  it('does not split a surrogate pair at the cut', () => {
    const name = buildCaseName('a.ts', 1, '😀'.repeat(130));
    expect(Array.from(name.slice('a.ts:1 '.length))).toHaveLength(120);
  });
});

describe('truncateError', () => {
  it('cuts to 300 chars', () => {
    const t = truncateError(new Error('word '.repeat(200)));
    expect(t.length).toBe(300);
    expect(t.endsWith('…')).toBe(true);
  });
  it('strips key-like tokens', () => {
    const t = truncateError(
      'Incorrect API key provided: sk-or-v1-abcdef1234567890abcdef. Authorization: Bearer abc.def-ghi, api_key=hunter2hunter2',
    );
    expect(t).not.toContain('sk-or-v1');
    expect(t).not.toContain('abc.def-ghi');
    expect(t).not.toContain('hunter2');
    expect(t).toContain('[redacted]');
  });
  it('redacts a bare short `key=<value>` but leaves prose like "key: not set"', () => {
    const t = truncateError('GET https://api.example.com/v1/models?key=abc123&x=1 failed; OpenRouter key: not set');
    expect(t).not.toContain('abc123');
    expect(t).toContain('key=[redacted]');
    expect(t).toContain('&x=1');
    expect(t).toContain('key: not set');
  });
  it('strips long opaque tokens (32+ chars) without a key prefix', () => {
    const opaque = 'AbCdEf0123456789_-AbCdEf0123456789xyz';
    const t = truncateError(`upstream said: ${opaque} is invalid`);
    expect(t).not.toContain(opaque);
    expect(t).toContain('[redacted]');
    expect(truncateError('value 012345678901234567890123456789012345')).toContain('[redacted]');
  });
  it('redacts each provider-key shape on its own and leaves the surrounding text', () => {
    const cases: [string, string][] = [
      ['401 from upstream: sk-proj-AbCdEf0123456789 rejected', 'sk-proj-AbCdEf0123456789'],
      ['request failed with Bearer eyJhbGciOi.payload.sig', 'eyJhbGciOi.payload.sig'],
      ['bad token=ghp_0123456789abcdefABCD for repo', 'ghp_0123456789abcdefABCD'],
      ['GET /v1?api_key=short1 failed', 'short1'],
      ['{"password": "hunter2"} refused', 'hunter2'],
      ['provider said secret: s3cr3tvalue', 's3cr3tvalue'],
    ];
    for (const [input, leaked] of cases) {
      const t = truncateError(input);
      expect(t, input).not.toContain(leaked);
      expect(t, input).toContain('[redacted]');
    }
    expect(truncateError('401 from upstream: sk-proj-AbCdEf0123456789 rejected')).toBe(
      '401 from upstream: [redacted] rejected',
    );
  });
  it('redacts a token that sits across the 300-char cut before cutting', () => {
    const secret = 'sk-or-v1-0123456789abcdef0123456789abcdef';
    const t = truncateError(`${'x '.repeat(145)}${secret} tail`);
    expect(t.length).toBeLessThanOrEqual(300);
    expect(t).not.toContain('sk-or');
    expect(t).not.toContain('0123456789abcdef');
  });
  it('does not cut a message of exactly 300 chars, and cuts 301 to 300 with an ellipsis', () => {
    const exact = `${'ab '.repeat(99)}abc`;
    expect(exact).toHaveLength(300);
    expect(truncateError(exact)).toBe(exact);
    const over = truncateError(`${exact}d`);
    expect(over).toHaveLength(300);
    expect(over.endsWith('…')).toBe(true);
  });
  it('collapses whitespace and stringifies non-Error values', () => {
    expect(truncateError('line one\n\n  line   two')).toBe('line one line two');
    expect(truncateError(new Error('  spaced  out  '))).toBe('spaced out');
    expect(truncateError({ toString: () => 'custom thing' })).toBe('custom thing');
    expect(truncateError(undefined)).toBe('undefined');
  });
  it('keeps an ordinary message intact', () => {
    expect(truncateError('timed out after 60 s')).toBe('timed out after 60 s');
  });
});

describe('copies stay in parity with the reviews originals (plan N7)', () => {
  const patch = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

  it('buildSingleFileDiff equals diffFromPrFiles for one file', async () => {
    const repo = { getPrFiles: async () => [{ path: 'src/config.ts', patch }] };
    const original = await diffFromPrFiles(repo as never, 'pr-1');
    const mine = parseUnifiedDiff(buildSingleFileDiff('src/config.ts', patch));
    expect(mine.raw).toBe(original.raw);
    expect(mine).toEqual(original);
  });

  it('evalSkillBlock equals toSkillPromptBlock for own and third-party skills', () => {
    for (const source of [undefined, 'manual', 'imported_file', 'imported_url', 'community']) {
      const skill = { name: 'Security', body: '  Check secrets.\n\n', source };
      expect(evalSkillBlock(skill)).toBe(toSkillPromptBlock(skill));
    }
  });

  it('evalTaskLine equals taskLine minus the author, and keeps the PR title', () => {
    const pull = { number: 482, title: 'Add rate limiting', author: 'zz-author' };
    const original = taskLine(pull as never);
    expect(evalTaskLine({ pr_number: 482, pr_title: 'Add rate limiting' })).toBe(
      original.replace(' by zz-author', ''),
    );
    expect(evalTaskLine({ pr_number: 482, pr_title: 'Add rate limiting' })).toContain('"Add rate limiting"');
  });
});

describe('row mappers', () => {
  const ranAt = new Date('2026-10-12T10:00:00.000Z');
  it('toEvalSuiteRun maps camelCase columns to the snake_case contract', () => {
    const dto = toEvalSuiteRun({
      id: 's1',
      workspaceId: 'w1',
      ownerKind: 'agent' as const,
      agentId: 'a1',
      agentVersion: 3,
      skillId: null,
      skillVersion: null,
      status: 'partial',
      ranAt,
      finishedAt: new Date('2026-10-12T10:01:00.000Z'),
      caseIds: ['c1', 'c2'],
      skills: ['Sec'],
      casesTotal: 2,
      casesCompleted: 1,
      casesPassed: 1,
      casesErrored: 1,
      recall: 1,
      precision: null,
      citationAccuracy: 0.5,
      costUsd: 0.01,
      durationMs: 60000,
      error: null,
    });
    expect(dto).toMatchObject({
      id: 's1',
      owner_kind: 'agent',
      skill_id: null,
      skill_version: null,
      agent_id: 'a1',
      agent_version: 3,
      status: 'partial',
      ran_at: '2026-10-12T10:00:00.000Z',
      finished_at: '2026-10-12T10:01:00.000Z',
      case_ids: ['c1', 'c2'],
      cases_errored: 1,
      precision: null,
      citation_accuracy: 0.5,
    });
  });

  it('toEvalSuiteRun maps a skill suite and old rows read as agent suites', () => {
    const base = {
      id: 's2',
      workspaceId: 'w1',
      agentId: 'host',
      agentVersion: 2,
      status: 'running' as const,
      ranAt,
      finishedAt: null,
      caseIds: [],
      skills: ['Rubric'],
      casesTotal: 0,
      casesCompleted: 0,
      casesPassed: 0,
      casesErrored: 0,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
      durationMs: null,
      error: null,
    };
    expect(
      toEvalSuiteRun({ ...base, ownerKind: 'skill', skillId: 'k1', skillVersion: 5 }),
    ).toMatchObject({ owner_kind: 'skill', skill_id: 'k1', skill_version: 5, agent_id: 'host' });
    // a row without the new columns (undefined) still maps to nulls
    expect(toEvalSuiteRun({ ...base, ownerKind: 'agent' } as never)).toMatchObject({
      skill_id: null,
      skill_version: null,
    });
  });

  it('toEvalRecentRun carries every suite field plus the agent name, nulls kept', () => {
    const row = {
      id: 's1',
      workspaceId: 'w1',
      ownerKind: 'agent' as const,
      agentId: 'a1',
      agentVersion: 3,
      skillId: null,
      skillVersion: null,
      status: 'partial' as const,
      ranAt,
      finishedAt: new Date('2026-10-12T10:01:00.000Z'),
      caseIds: ['c1', 'c2'],
      skills: ['Sec'],
      casesTotal: 2,
      casesCompleted: 1,
      casesPassed: 1,
      casesErrored: 1,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
      durationMs: null,
      error: null,
    };
    const dto = toEvalRecentRun(row, 'Security reviewer');
    expect(dto).toEqual({ ...toEvalSuiteRun(row), agent_name: 'Security reviewer' });
    expect(dto.recall).toBeNull();
    expect(dto.cost_usd).toBeNull();
    expect(dto.case_ids).toEqual(['c1', 'c2']);
  });

  it('toEvalRunRecord reads the per-case fields from actual_output', () => {
    const e = exp('must_find', 'a.ts', 1, 2);
    const res = scoreCase(e, [f('a.ts', 1)], []);
    const rec = toEvalRunRecord(
      {
        id: 'r1',
        caseId: 'c1',
        suiteRunId: 's1',
        ranAt,
        actualOutput: res.output,
        pass: res.pass,
        recall: res.recall,
        precision: res.precision,
        citationAccuracy: res.citation_accuracy,
        durationMs: 1200,
        costUsd: null,
      },
      'a.ts:1 title',
    );
    expect(rec).toMatchObject({
      suite_run_id: 's1',
      case_name: 'a.ts:1 title',
      outcome: 'passed',
      expectation_kind: 'must_find',
      matched: true,
      findings_kept: 1,
      findings_dropped: 0,
      error: null,
      pass: true,
      cost_usd: null,
    });
  });

  it('toEvalCase fills nullable columns', () => {
    const meta = { pr_number: 1, pr_title: 't', pr_body: null, repo: 'o/n' };
    const dto = toEvalCase({
      id: 'c1',
      workspaceId: 'w1',
      ownerKind: 'agent',
      ownerId: 'a1',
      name: 'n',
      inputDiff: 'diff',
      inputFiles: ['a.ts'],
      inputMeta: meta,
      expectedOutput: { kind: 'must_find' } as never,
      notes: null,
    });
    expect(dto.input_meta).toEqual(meta);
    expect(dto.notes).toBeNull();
  });
});

describe('dashboardRows (spec B AC-10)', () => {
  const suite = (over: Partial<EvalSuiteRun>): EvalSuiteRun => ({
    id: 's',
    agent_id: 'a',
    agent_version: 1,
    status: 'done',
    ran_at: '2026-10-01T00:00:00.000Z',
    finished_at: '2026-10-01T00:01:00.000Z',
    case_ids: [],
    skills: [],
    cases_total: 8,
    cases_completed: 8,
    cases_passed: 6,
    cases_errored: 0,
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: 0.01,
    duration_ms: 1000,
    error: null,
    ...over,
  });

  it('delta = latest finished minus the previous finished; negative recall/precision is a drop', () => {
    const rows = dashboardRows([
      {
        agent_id: 'a1',
        agent_name: 'Zeta',
        cases_total: 8,
        running: false,
        finished: [
          suite({ id: 'old', ran_at: '2026-10-01T00:00:00.000Z', recall: 0.8, precision: 0.6, citation_accuracy: 0.9 }),
          suite({ id: 'new', ran_at: '2026-10-02T00:00:00.000Z', recall: 0.6, precision: 0.7, citation_accuracy: 1 }),
          suite({ id: 'run', status: 'running', ran_at: '2026-10-03T00:00:00.000Z', recall: null }),
          suite({ id: 'bad', status: 'failed', ran_at: '2026-10-04T00:00:00.000Z', recall: null }),
        ],
      },
    ]);
    expect(rows[0]!.latest!.id).toBe('new');
    expect(rows[0]!.delta).toEqual({ recall: -0.2, precision: 0.1, citation_accuracy: 0.1 });
    expect(rows[0]!.drop).toBe(true);
  });

  it('a null on either side gives a null delta and no drop; one finished run has no delta', () => {
    const rows = dashboardRows([
      {
        agent_id: 'a1',
        agent_name: 'A',
        cases_total: 2,
        running: true,
        finished: [
          suite({ id: 'p', ran_at: '2026-10-01T00:00:00.000Z', recall: 0.9, precision: null }),
          suite({ id: 'l', ran_at: '2026-10-02T00:00:00.000Z', recall: null, precision: 0.2 }),
        ],
      },
      { agent_id: 'a2', agent_name: 'B', cases_total: 1, running: false, finished: [suite({ id: 'x' })] },
      { agent_id: 'a3', agent_name: 'C', cases_total: 3, running: false, finished: [] },
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.agent_id, r]));
    expect(byId.a1!.delta).toEqual({ recall: null, precision: null, citation_accuracy: 0 });
    expect(byId.a1!.drop).toBe(false);
    expect(byId.a1!.running).toBe(true);
    expect(byId.a2!.delta).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(byId.a3!.latest).toBeNull();
    expect(byId.a3!.drop).toBe(false);
  });

  it('rounds the delta to 6 decimals: 0.8 - 0.6 is exactly 0.2 and raises no drop', () => {
    // Raw float: 0.8 - 0.6 === 0.20000000000000007 and 0.6 - 0.8 === -0.20000000000000007.
    const up = dashboardRows([
      {
        agent_id: 'a1',
        agent_name: 'Up',
        cases_total: 1,
        running: false,
        finished: [
          suite({ id: 'p', ran_at: '2026-10-01T00:00:00.000Z', recall: 0.6, precision: 0.6 }),
          suite({ id: 'l', ran_at: '2026-10-02T00:00:00.000Z', recall: 0.8, precision: 0.8 }),
        ],
      },
    ])[0]!;
    expect(up.delta.recall).toBe(0.2);
    expect(up.delta.precision).toBe(0.2);
    expect(up.drop).toBe(false);

    const down = dashboardRows([
      {
        agent_id: 'a2',
        agent_name: 'Down',
        cases_total: 1,
        running: false,
        finished: [
          suite({ id: 'p', ran_at: '2026-10-01T00:00:00.000Z', recall: 0.8 }),
          suite({ id: 'l', ran_at: '2026-10-02T00:00:00.000Z', recall: 0.6 }),
        ],
      },
    ])[0]!;
    expect(down.delta.recall).toBe(-0.2);
    expect(down.drop).toBe(true);
  });

  it('float noise between equal metrics is not a drop', () => {
    // 0.1 + 0.2 === 0.30000000000000004: a raw subtraction would be -5.5e-17 and flag a drop.
    const row = dashboardRows([
      {
        agent_id: 'a1',
        agent_name: 'Flat',
        cases_total: 1,
        running: false,
        finished: [
          suite({ id: 'p', ran_at: '2026-10-01T00:00:00.000Z', recall: 0.1 + 0.2, precision: 0.1 + 0.2 }),
          suite({ id: 'l', ran_at: '2026-10-02T00:00:00.000Z', recall: 0.3, precision: 0.3 }),
        ],
      },
    ])[0]!;
    expect(row.drop).toBe(false);
    expect(row.delta.recall! + 0).toBe(0);
    expect(row.delta.precision! + 0).toBe(0);
  });

  it('a metric that goes from a value to null (or null to a value) has a null delta and no drop', () => {
    const mk = (prev: number | null, latest: number | null) =>
      dashboardRows([
        {
          agent_id: 'a1',
          agent_name: 'N',
          cases_total: 1,
          running: false,
          finished: [
            suite({ id: 'p', ran_at: '2026-10-01T00:00:00.000Z', recall: prev, precision: prev }),
            suite({ id: 'l', ran_at: '2026-10-02T00:00:00.000Z', recall: latest, precision: latest }),
          ],
        },
      ])[0]!;
    for (const row of [mk(0.9, null), mk(null, 0.1), mk(null, null)]) {
      expect(row.delta.recall).toBeNull();
      expect(row.delta.precision).toBeNull();
      expect(row.drop).toBe(false);
    }
  });

  it('orders drop rows first, then by agent name', () => {
    const mk = (id: string, name: string, drop: boolean) => ({
      agent_id: id,
      agent_name: name,
      cases_total: 1,
      running: false,
      finished: [
        suite({ id: `${id}-p`, ran_at: '2026-10-01T00:00:00.000Z', recall: 0.5 }),
        suite({ id: `${id}-l`, ran_at: '2026-10-02T00:00:00.000Z', recall: drop ? 0.4 : 0.6 }),
      ],
    });
    const rows = dashboardRows([mk('1', 'beta', false), mk('2', 'Zulu', true), mk('3', 'alpha', false), mk('4', 'Mike', true)]);
    expect(rows.map((r) => r.agent_name)).toEqual(['Mike', 'Zulu', 'alpha', 'beta']);
  });
});

describe('constants', () => {
  it('match the spec', () => {
    expect(EVAL_CASE_TIMEOUT_MS).toBe(120_000);
    expect(EVAL_MAX_CASES).toBe(100);
    expect(EVAL_MAX_OUTPUT_TOKENS).toBe(8192);
  });
});

// Type-level guard: a stored output is an EvalActualOutput.
const _typed: EvalActualOutput = errorCase('must_find', 'x').output;
void _typed;

describe('skill eval helpers (G1)', () => {
  it('hostRefusal: agent case takes no host, skill case needs one', () => {
    expect(hostRefusal('agent', false)).toBeNull();
    expect(hostRefusal('agent', true)).toBe('host_not_allowed');
    expect(hostRefusal('skill', false)).toBe('host_required');
    expect(hostRefusal('skill', true)).toBeNull();
  });

  it('suiteLogLine keeps the agent format and adds the skill id for a skill suite', () => {
    const s = { status: 'done', casesPassed: 2, casesTotal: 3, costUsd: 0.0123 };
    expect(suiteLogLine('s1', s)).toBe('eval suite s1: done, 2/3 passed, cost $0.0123');
    expect(suiteLogLine('s1', s, null)).toBe('eval suite s1: done, 2/3 passed, cost $0.0123');
    expect(suiteLogLine('s1', { ...s, costUsd: null }, 'k1')).toBe(
      'eval suite s1 (skill k1): done, 2/3 passed, cost n/a',
    );
  });

  it('singleRunLogLine names the skill when given', () => {
    expect(singleRunLogLine('c1', 'passed', 0.5)).toBe('eval case c1: single run passed, cost $0.5000');
    expect(singleRunLogLine('c1', 'error', null, 'k1')).toBe(
      'eval case c1 (skill k1): single run error, cost n/a',
    );
  });
});
