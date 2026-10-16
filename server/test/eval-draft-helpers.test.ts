import { describe, it, expect } from 'vitest';
import { EvalExpectationInput, EvalDryRunResult } from '@devdigest/shared';
import type { Finding } from '@devdigest/shared';
import {
  buildCaseDraft,
  buildCaseName,
  buildExpectation,
  buildSingleFileDiff,
  dryRunLogLine,
  errorCase,
  expectationRefusal,
  scoreCase,
  toDryRunResult,
  toExpectationInput,
  withServerSource,
} from '../src/modules/eval/helpers.js';
import type { FindingScope } from '../src/modules/eval/types.js';

function scope(over: Partial<FindingScope> = {}): FindingScope {
  return {
    finding_id: 'f-1',
    file: 'src/auth.ts',
    start_line: 12,
    end_line: 15,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Token compared with ==',
    accepted_at: null,
    dismissed_at: null,
    review_id: 'rev-1',
    agent_id: 'ag-1',
    run_id: 'run-1',
    pr_id: 'pr-1',
    pr_number: 7,
    pr_title: 'Harden auth',
    pr_body: 'Body text',
    head_sha: 'abc123',
    repo: 'acme/api',
    patch: '@@ -10,3 +10,4 @@\n ctx\n+added\n',
    ...over,
  };
}

function fnd(file: string, start: number, end = start): Finding {
  return {
    id: `${file}:${start}`,
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
    confidence: 0.8,
    kind: 'finding',
  };
}

describe('buildCaseDraft', () => {
  it('equals buildExpectation minus source; name and diff come from the shared builders', () => {
    const s = scope();
    const full = buildExpectation(s, 'must_find', 'ag-1');
    const draft = buildCaseDraft(s, 'must_find', 'ag-1');
    const { source: _src, ...rest } = full;
    expect(draft.expected_output).toEqual(rest);
    expect(draft.expected_output).not.toHaveProperty('source');
    expect(draft.name).toBe(buildCaseName(s.file, s.start_line, s.title));
    expect(draft.input_diff).toBe(buildSingleFileDiff(s.file, s.patch!));
    expect(draft.input_files).toEqual(['src/auth.ts']);
    expect(draft.input_meta).toEqual({
      pr_number: 7,
      pr_title: 'Harden auth',
      pr_body: 'Body text',
      repo: 'acme/api',
    });
    expect(draft.finding_id).toBe('f-1');
    expect(draft.agent_id).toBe('ag-1');
    expect(EvalExpectationInput.safeParse(draft.expected_output).success).toBe(true);
  });

  it('toExpectationInput drops source only', () => {
    const full = buildExpectation(scope(), 'must_not_flag', 'ag-1');
    expect(Object.keys(toExpectationInput(full)).sort()).toEqual(
      ['category', 'end_line', 'file', 'kind', 'severity', 'start_line', 'title'],
    );
  });
});

describe('long title (plan R1)', () => {
  it('truncates to 500 chars with an ellipsis so the draft stays serializable', () => {
    const e = buildExpectation(scope({ title: 'x'.repeat(2000) }), 'must_find', 'ag-1');
    expect(e.title).toHaveLength(500);
    expect(e.title.endsWith('…')).toBe(true);
    const draft = buildCaseDraft(scope({ title: 'x'.repeat(2000) }), 'must_find', 'ag-1');
    expect(EvalExpectationInput.safeParse(draft.expected_output).success).toBe(true);
  });

  it('leaves a title of exactly 500 chars untouched', () => {
    const t = 'y'.repeat(500);
    expect(buildExpectation(scope({ title: t }), 'must_find', 'ag-1').title).toBe(t);
  });
});

describe('expectationRefusal (R-3, in order)', () => {
  const draft = { input_files: ['src/auth.ts'] };

  it('null when file and kind match', () => {
    expect(expectationRefusal({ file: 'src/auth.ts', kind: 'must_find' }, draft, 'must_find')).toBeNull();
  });

  it('file_not_in_diff for another file', () => {
    expect(expectationRefusal({ file: 'src/x.ts', kind: 'must_find' }, draft, 'must_find')).toBe(
      'file_not_in_diff',
    );
  });

  it('kind_mismatch when the decision flipped', () => {
    expect(expectationRefusal({ file: 'src/auth.ts', kind: 'must_find' }, draft, 'must_not_flag')).toBe(
      'kind_mismatch',
    );
  });

  it('file_not_in_diff wins when both are wrong', () => {
    expect(expectationRefusal({ file: 'src/x.ts', kind: 'must_find' }, draft, 'must_not_flag')).toBe(
      'file_not_in_diff',
    );
  });
});

describe('withServerSource', () => {
  it('keeps the caller values and takes source from the derived expectation', () => {
    const derived = buildExpectation(scope(), 'must_find', 'ag-1');
    const input = { ...toExpectationInput(derived), start_line: 13, end_line: 14, title: 'mine' };
    const full = withServerSource(input, derived);
    expect(full.start_line).toBe(13);
    expect(full.title).toBe('mine');
    expect(full.source).toEqual(derived.source);
  });
});

describe('toDryRunResult', () => {
  const derived = buildExpectation(scope(), 'must_find', 'ag-1');
  const loc = toExpectationInput(derived);

  it('passed: counts kept findings that intersect', () => {
    const r = scoreCase(derived, [fnd('src/auth.ts', 13), fnd('src/other.ts', 1)], []);
    const out = toDryRunResult(r, loc, 0.0123, 1800, 4);
    expect(out).toMatchObject({
      outcome: 'passed',
      pass: true,
      matched: true,
      matched_count: 1,
      findings_kept: 2,
      findings_dropped: 0,
      cost_usd: 0.0123,
      duration_ms: 1800,
      agent_version: 4,
      error: null,
    });
    expect(EvalDryRunResult.safeParse(out).success).toBe(true);
  });

  it('a narrowed range that no longer intersects gives failed for must_find', () => {
    const narrowed = { ...loc, start_line: 40, end_line: 41 };
    const r = scoreCase(narrowed, [fnd('src/auth.ts', 13)], []);
    const out = toDryRunResult(r, narrowed, 0.01, 10, 1);
    expect(out.outcome).toBe('failed');
    expect(out.pass).toBe(false);
    expect(out.matched_count).toBe(0);
  });

  it('override and derived expectation give different outcomes on the same findings', () => {
    const kept = [fnd('src/auth.ts', 13)];
    const narrowed = { ...loc, start_line: 40, end_line: 41 };
    expect(scoreCase(loc, kept, []).outcome).toBe('passed');
    expect(scoreCase(narrowed, kept, []).outcome).toBe('failed');
  });

  it('must_not_flag: matched_count > 0 when a kept finding matches (P2), pass false', () => {
    const neg = { ...loc, kind: 'must_not_flag' as const };
    const r = scoreCase(neg, [fnd('src/auth.ts', 13)], []);
    expect(r.matching_kept).toBe(0);
    const out = toDryRunResult(r, neg, 0.01, 10, 1);
    expect(out.matched_count).toBe(1);
    expect(out.outcome).toBe('failed');
    expect(out.expectation_kind).toBe('must_not_flag');
  });

  it('error: null counts, empty lists, null cost and pass', () => {
    const out = toDryRunResult(errorCase('must_find', 'boom'), loc, 0.5, 99, 2);
    expect(out).toMatchObject({
      outcome: 'error',
      pass: null,
      matched: null,
      matched_count: null,
      findings_kept: null,
      findings_dropped: null,
      kept: [],
      dropped: [],
      cost_usd: null,
      error: 'boom',
      duration_ms: 99,
      agent_version: 2,
    });
    expect(EvalDryRunResult.safeParse(out).success).toBe(true);
  });
});

describe('dryRunLogLine', () => {
  it('prints cost with four decimals or n/a', () => {
    expect(dryRunLogLine('f-1', 'passed', 0.0123, 1800)).toBe(
      'eval dry-run finding f-1: passed, cost $0.0123, 1800 ms',
    );
    expect(dryRunLogLine('f-1', 'error', null, 12)).toBe(
      'eval dry-run finding f-1: error, cost n/a, 12 ms',
    );
  });
});
