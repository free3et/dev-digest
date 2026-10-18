import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  EvalExpectation,
  EvalCase,
  EvalSuiteStatus,
  EvalCaseOutcome,
  EvalActualOutput,
  EvalRunRecord,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalDashboardRow,
  EvalRecentRunsQuery,
  EvalRecentRun,
  EvalRun,
  EvalCaseInput,
  EvalExpectationInput,
  EvalCaseOverrides,
  EvalCaseDraft,
  EvalDryRunRequest,
  EvalDryRunResult,
  EvalCaseCopyRequest,
  EvalSuiteStartRequest,
} from '@devdigest/shared';

/**
 * Contract tests for the eval pipeline (Spec A + Spec B): fixtures round-trip
 * through the shared schemas, every constraint has a rejecting case, and the
 * client's vendored copies of the two contract files stay byte-identical.
 */

const finding = {
  id: 'f1',
  severity: 'CRITICAL',
  category: 'bug',
  title: 'Null deref',
  file: 'src/a.ts',
  start_line: 10,
  end_line: 12,
  rationale: 'x is null here',
  suggestion: null,
  confidence: 0.9,
};

const expectation = {
  kind: 'must_find',
  file: 'src/a.ts',
  start_line: 10,
  end_line: 12,
  title: 'Null deref',
  severity: 'CRITICAL',
  category: 'bug',
  source: {
    finding_id: 'f1',
    review_id: 'r1',
    pr_id: 'p1',
    repo: 'acme/api',
    head_sha: 'abc123',
    agent_id: 'a1',
    run_id: null,
  },
};

const evalCase = {
  id: 'c1',
  owner_kind: 'agent',
  owner_id: 'a1',
  name: 'src/a.ts:10 Null deref',
  input_diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n',
  input_files: ['src/a.ts'],
  input_meta: { pr_number: 7, pr_title: 'Fix', pr_body: null, repo: 'acme/api' },
  expected_output: expectation,
  notes: null,
};

const actualOutput = {
  kept: [finding],
  dropped: [{ finding: { ...finding, id: 'f2' }, reason: "file 'x' not present in diff" }],
  outcome: 'passed',
  expectation_kind: 'must_find',
  matched: true,
  findings_kept: 1,
  findings_dropped: 1,
  error: null,
};

const runRecord = {
  id: 'er1',
  case_id: 'c1',
  case_name: 'src/a.ts:10 Null deref',
  suite_run_id: 's1',
  ran_at: '2026-10-12T10:00:00.000Z',
  actual_output: actualOutput,
  pass: true,
  outcome: 'passed',
  expectation_kind: 'must_find',
  findings_kept: 1,
  findings_dropped: 1,
  matched: true,
  error: null,
  recall: 1,
  precision: 0.5,
  citation_accuracy: 0.5,
  duration_ms: 1200,
  cost_usd: 0.002,
};

const suiteRun = {
  id: 's1',
  owner_kind: 'agent',
  agent_id: 'a1',
  agent_version: 3,
  skill_id: null,
  skill_version: null,
  status: 'done',
  ran_at: '2026-10-12T10:00:00.000Z',
  finished_at: '2026-10-12T10:01:00.000Z',
  case_ids: ['c1'],
  skills: ['security'],
  cases_total: 1,
  cases_completed: 1,
  cases_passed: 1,
  cases_errored: 0,
  recall: 1,
  precision: 0.5,
  citation_accuracy: 0.5,
  cost_usd: 0.002,
  duration_ms: 60000,
  error: null,
};

describe('EvalExpectation', () => {
  it('round-trips a must_find and a must_not_flag fixture', () => {
    expect(EvalExpectation.parse(expectation)).toEqual(expectation);
    const neg = { ...expectation, kind: 'must_not_flag', source: { ...expectation.source, run_id: 'run1' } };
    expect(EvalExpectation.parse(neg)).toEqual(neg);
  });

  it('accepts a single-line range (end_line == start_line)', () => {
    expect(EvalExpectation.safeParse({ ...expectation, start_line: 5, end_line: 5 }).success).toBe(true);
  });

  it('rejects end_line < start_line', () => {
    expect(EvalExpectation.safeParse({ ...expectation, start_line: 12, end_line: 10 }).success).toBe(false);
  });

  it('rejects start_line < 1 and non-integer lines', () => {
    expect(EvalExpectation.safeParse({ ...expectation, start_line: 0, end_line: 3 }).success).toBe(false);
    expect(EvalExpectation.safeParse({ ...expectation, start_line: 1.5, end_line: 3 }).success).toBe(false);
  });

  it('rejects an unknown kind and a missing source field', () => {
    expect(EvalExpectation.safeParse({ ...expectation, kind: 'should_find' }).success).toBe(false);
    const { head_sha: _h, ...src } = expectation.source;
    expect(EvalExpectation.safeParse({ ...expectation, source: src }).success).toBe(false);
  });

  it('keeps run_id nullable but required', () => {
    const { run_id: _r, ...src } = expectation.source;
    expect(EvalExpectation.safeParse({ ...expectation, source: src }).success).toBe(false);
  });
});

describe('EvalCase', () => {
  it('round-trips the typed fixture', () => {
    expect(EvalCase.parse(evalCase)).toEqual(evalCase);
  });

  it('accepts a PR body string and a notes string', () => {
    const c = { ...evalCase, input_meta: { ...evalCase.input_meta, pr_body: 'why' }, notes: 'n' };
    expect(EvalCase.parse(c)).toEqual(c);
  });

  it('rejects an untyped expected_output, a string input_files and a missing notes', () => {
    expect(EvalCase.safeParse({ ...evalCase, expected_output: { anything: true } }).success).toBe(false);
    expect(EvalCase.safeParse({ ...evalCase, input_files: 'src/a.ts' }).success).toBe(false);
    const { notes: _n, ...noNotes } = evalCase;
    expect(EvalCase.safeParse(noNotes).success).toBe(false);
  });

  it('rejects input_meta without a repo or with a non-integer pr_number', () => {
    const { repo: _r, ...meta } = evalCase.input_meta;
    expect(EvalCase.safeParse({ ...evalCase, input_meta: meta }).success).toBe(false);
    expect(
      EvalCase.safeParse({ ...evalCase, input_meta: { ...evalCase.input_meta, pr_number: 1.2 } }).success,
    ).toBe(false);
  });

  it('leaves EvalCaseInput and EvalRun unchanged (still loose / suite-level)', () => {
    expect(
      EvalCaseInput.safeParse({
        owner_kind: 'agent',
        owner_id: 'a1',
        name: 'n',
        expected_output: { anything: 1 },
      }).success,
    ).toBe(true);
    expect(
      EvalRun.safeParse({
        recall: 1,
        precision: 1,
        citation_accuracy: 1,
        traces_passed: 1,
        traces_total: 1,
        duration_ms: 1,
        cost_usd: null,
        per_trace: [],
      }).success,
    ).toBe(true);
  });
});

describe('EvalSuiteStatus / EvalCaseOutcome', () => {
  it('accept exactly their values', () => {
    for (const s of ['running', 'done', 'partial', 'failed']) {
      expect(EvalSuiteStatus.safeParse(s).success).toBe(true);
    }
    expect(EvalSuiteStatus.safeParse('finished').success).toBe(false);
    for (const o of ['passed', 'failed', 'error']) {
      expect(EvalCaseOutcome.safeParse(o).success).toBe(true);
    }
    expect(EvalCaseOutcome.safeParse('skipped').success).toBe(false);
  });
});

describe('EvalActualOutput', () => {
  it('round-trips kept and dropped-with-reason', () => {
    expect(EvalActualOutput.parse(actualOutput)).toEqual(actualOutput);
  });

  it('round-trips an error output (empty lists, null counts)', () => {
    const err = {
      kept: [],
      dropped: [],
      outcome: 'error',
      expectation_kind: 'must_not_flag',
      matched: null,
      findings_kept: null,
      findings_dropped: null,
      error: 'timed out after 60 s',
    };
    expect(EvalActualOutput.parse(err)).toEqual(err);
  });

  it('rejects a dropped entry without a reason', () => {
    expect(EvalActualOutput.safeParse({ ...actualOutput, dropped: [{ finding }] }).success).toBe(false);
  });
});

describe('EvalRunRecord', () => {
  it('round-trips a passed case', () => {
    expect(EvalRunRecord.parse(runRecord)).toEqual(runRecord);
  });

  it('round-trips an error case (null pass, counts, metrics)', () => {
    const err = {
      ...runRecord,
      pass: null,
      outcome: 'error',
      findings_kept: null,
      findings_dropped: null,
      matched: null,
      error: 'schema failure',
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
      actual_output: { ...actualOutput, kept: [], dropped: [], outcome: 'error', matched: null,
        findings_kept: null, findings_dropped: null, error: 'schema failure' },
    };
    expect(EvalRunRecord.parse(err)).toEqual(err);
  });

  it('accepts a null suite_run_id (per-case run outside a suite)', () => {
    expect(EvalRunRecord.safeParse({ ...runRecord, suite_run_id: null }).success).toBe(true);
  });

  it('rejects metrics outside 0..1', () => {
    expect(EvalRunRecord.safeParse({ ...runRecord, recall: 1.01 }).success).toBe(false);
    expect(EvalRunRecord.safeParse({ ...runRecord, precision: -0.1 }).success).toBe(false);
    expect(EvalRunRecord.safeParse({ ...runRecord, citation_accuracy: 2 }).success).toBe(false);
  });

  it('rejects an unknown outcome and a missing expectation_kind', () => {
    expect(EvalRunRecord.safeParse({ ...runRecord, outcome: 'timeout' }).success).toBe(false);
    const { expectation_kind: _k, ...rest } = runRecord;
    expect(EvalRunRecord.safeParse(rest).success).toBe(false);
  });
});

describe('EvalSuiteRun / EvalSuiteRunDetail', () => {
  it('round-trips a finished suite', () => {
    expect(EvalSuiteRun.parse(suiteRun)).toEqual(suiteRun);
  });

  it('round-trips a running suite (null finish, metrics, duration)', () => {
    const running = {
      ...suiteRun,
      status: 'running',
      finished_at: null,
      cases_completed: 0,
      cases_passed: 0,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
      duration_ms: null,
    };
    expect(EvalSuiteRun.parse(running)).toEqual(running);
  });

  it('round-trips a failed suite carrying its reason', () => {
    const failed = { ...suiteRun, status: 'failed', error: 'interrupted', cases_errored: 1, cases_passed: 0 };
    expect(EvalSuiteRun.parse(failed)).toEqual(failed);
  });

  it('rejects a bad status, a metric above 1 and a fractional count', () => {
    expect(EvalSuiteRun.safeParse({ ...suiteRun, status: 'queued' }).success).toBe(false);
    expect(EvalSuiteRun.safeParse({ ...suiteRun, recall: 1.5 }).success).toBe(false);
    expect(EvalSuiteRun.safeParse({ ...suiteRun, cases_total: 2.5 }).success).toBe(false);
  });

  it('requires owner_kind and accepts a skill suite', () => {
    const { owner_kind: _o, ...noKind } = suiteRun;
    expect(EvalSuiteRun.safeParse(noKind).success).toBe(false);
    const skillSuite = { ...suiteRun, owner_kind: 'skill', skill_id: 'k1', skill_version: 4 };
    expect(EvalSuiteRun.parse(skillSuite)).toEqual(skillSuite);
    expect(EvalSuiteRun.safeParse({ ...suiteRun, owner_kind: 'user' }).success).toBe(false);
    expect(EvalSuiteRun.safeParse({ ...suiteRun, skill_version: 1.5 }).success).toBe(false);
  });

  it('detail adds cases[] of EvalRunRecord', () => {
    const detail = { ...suiteRun, cases: [runRecord] };
    expect(EvalSuiteRunDetail.parse(detail)).toEqual(detail);
    expect(EvalSuiteRunDetail.safeParse({ ...suiteRun }).success).toBe(false);
    expect(EvalSuiteRunDetail.safeParse({ ...suiteRun, cases: [{ id: 'x' }] }).success).toBe(false);
  });
});

describe('EvalDashboardRow', () => {
  const row = {
    agent_id: 'a1',
    agent_name: 'Security reviewer',
    cases_total: 8,
    latest: suiteRun,
    running: false,
    delta: { recall: -0.1, precision: 0.2, citation_accuracy: null },
    drop: true,
  };

  it('round-trips a row with a latest run and a partly-null delta', () => {
    expect(EvalDashboardRow.parse(row)).toEqual(row);
  });

  it('round-trips a never-run row', () => {
    const never = {
      ...row,
      latest: null,
      delta: { recall: null, precision: null, citation_accuracy: null },
      drop: false,
    };
    expect(EvalDashboardRow.parse(never)).toEqual(never);
  });

  it('rejects cases_total 0, a missing drop flag and a malformed latest', () => {
    expect(EvalDashboardRow.safeParse({ ...row, cases_total: 0 }).success).toBe(false);
    const { drop: _d, ...noDrop } = row;
    expect(EvalDashboardRow.safeParse(noDrop).success).toBe(false);
    expect(EvalDashboardRow.safeParse({ ...row, latest: { id: 's1' } }).success).toBe(false);
  });
});

describe('EvalRecentRunsQuery / EvalRecentRun (Spec D)', () => {
  it('defaults limit to 10 and coerces numeric strings', () => {
    expect(EvalRecentRunsQuery.parse({})).toEqual({ limit: 10 });
    expect(EvalRecentRunsQuery.parse({ limit: '3' })).toEqual({ limit: 3 });
    expect(EvalRecentRunsQuery.parse({ limit: '50' })).toEqual({ limit: 50 });
    expect(EvalRecentRunsQuery.parse({ limit: '1' })).toEqual({ limit: 1 });
  });

  it('rejects 0, 51, non-numbers, fractions and the empty string', () => {
    for (const limit of ['0', '51', 'abc', '2.5', '']) {
      expect(EvalRecentRunsQuery.safeParse({ limit }).success).toBe(false);
    }
  });

  it('round-trips a run with null metrics and requires agent_name', () => {
    const nulls = { ...suiteRun, recall: null, precision: null, citation_accuracy: null };
    const run = { ...nulls, agent_name: 'Security reviewer' };
    expect(EvalRecentRun.parse(run)).toEqual(run);
    const { agent_name: _n, ...noName } = run;
    expect(EvalRecentRun.safeParse(noName).success).toBe(false);
  });
});

describe('EvalExpectationInput (Spec C)', () => {
  const { source: _s, ...input } = expectation;

  it('round-trips the caller-editable shape', () => {
    expect(EvalExpectationInput.parse(input)).toEqual(input);
  });

  it('rejects source, end_line < start_line, start_line 0, long file and long title', () => {
    expect(EvalExpectationInput.safeParse({ ...input, source: expectation.source }).success).toBe(false);
    expect(EvalExpectationInput.safeParse({ ...input, start_line: 12, end_line: 10 }).success).toBe(false);
    expect(EvalExpectationInput.safeParse({ ...input, start_line: 0 }).success).toBe(false);
    expect(EvalExpectationInput.safeParse({ ...input, file: 'a'.repeat(1001) }).success).toBe(false);
    expect(EvalExpectationInput.safeParse({ ...input, file: '' }).success).toBe(false);
    expect(EvalExpectationInput.safeParse({ ...input, title: 'x'.repeat(501) }).success).toBe(false);
    expect(EvalExpectationInput.safeParse({ ...input, title: 'x'.repeat(500) }).success).toBe(true);
  });
});

describe('EvalCaseOverrides (Spec C)', () => {
  const { source: _s, ...input } = expectation;

  it('accepts {} and a full body; trims the name', () => {
    expect(EvalCaseOverrides.parse({})).toEqual({});
    expect(EvalCaseOverrides.parse({ name: '  x  ' })).toEqual({ name: 'x' });
    expect(EvalCaseOverrides.parse({ name: 'n', expected_output: input })).toEqual({
      name: 'n',
      expected_output: input,
    });
  });

  it('rejects a blank or too long name', () => {
    expect(EvalCaseOverrides.safeParse({ name: '   ' }).success).toBe(false);
    expect(EvalCaseOverrides.safeParse({ name: 'n'.repeat(501) }).success).toBe(false);
  });

  it('rejects every non-editable key', () => {
    for (const key of ['input_diff', 'input_meta', 'input_files', 'owner_id', 'source', 'notes']) {
      expect(EvalCaseOverrides.safeParse({ [key]: 'x' }).success).toBe(false);
    }
  });
});

describe('EvalCaseDraft (Spec C)', () => {
  const { source: _s, ...input } = expectation;
  const draft = {
    finding_id: 'f1',
    agent_id: 'a1',
    name: 'src/a.ts:10 Null deref',
    input_diff: '@@ -1 +1 @@\n-a\n+b\n',
    input_files: ['src/a.ts'],
    input_meta: { pr_number: 7, pr_title: 'T', pr_body: null, repo: 'acme/api' },
    expected_output: input,
  };

  it('round-trips', () => {
    expect(EvalCaseDraft.parse(draft)).toEqual(draft);
  });

  it('rejects an expected_output carrying source', () => {
    expect(
      EvalCaseDraft.safeParse({ ...draft, expected_output: expectation }).success,
    ).toBe(false);
  });
});

describe('EvalDryRunRequest / EvalDryRunResult (Spec C)', () => {
  const { source: _s, ...input } = expectation;

  it('request: {} and expected_output ok, unknown key rejected', () => {
    expect(EvalDryRunRequest.parse({})).toEqual({});
    expect(EvalDryRunRequest.parse({ expected_output: input })).toEqual({ expected_output: input });
    expect(EvalDryRunRequest.safeParse({ input_diff: 'x' }).success).toBe(false);
  });

  it('request: optional uuid agent_id; the omit variant rejects it', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(EvalDryRunRequest.parse({ agent_id: id })).toEqual({ agent_id: id });
    expect(EvalDryRunRequest.parse({ expected_output: input, agent_id: id })).toEqual({
      expected_output: input,
      agent_id: id,
    });
    expect(EvalDryRunRequest.safeParse({ agent_id: 'nope' }).success).toBe(false);
    const findingBody = EvalDryRunRequest.omit({ agent_id: true });
    expect(findingBody.safeParse({ agent_id: id }).success).toBe(false);
    expect(findingBody.safeParse({}).success).toBe(true);
  });

  const base = {
    expectation_kind: 'must_find',
    duration_ms: 1800,
    agent_version: 3,
    skill_version: null,
  };
  const passed = {
    ...base,
    outcome: 'passed',
    pass: true,
    matched: true,
    matched_count: 1,
    findings_kept: 1,
    findings_dropped: 0,
    kept: [finding],
    dropped: [],
    cost_usd: 0.0123,
    error: null,
  };
  const failed = {
    ...passed,
    outcome: 'failed',
    pass: false,
    matched: false,
    matched_count: 0,
    findings_dropped: 1,
    kept: [],
    dropped: [{ finding, reason: 'outside hunk' }],
  };
  const errored = {
    ...base,
    outcome: 'error',
    pass: null,
    matched: null,
    matched_count: null,
    findings_kept: null,
    findings_dropped: null,
    kept: [],
    dropped: [],
    cost_usd: null,
    error: 'timed out after 60 s',
  };

  it('round-trips passed, failed and error', () => {
    for (const r of [passed, failed, errored]) {
      expect(EvalDryRunResult.parse(r)).toEqual(r);
    }
  });

  it('rejects an unknown outcome and a missing agent_version', () => {
    expect(EvalDryRunResult.safeParse({ ...passed, outcome: 'maybe' }).success).toBe(false);
    const { agent_version: _v, ...noVersion } = passed;
    expect(EvalDryRunResult.safeParse(noVersion).success).toBe(false);
  });
});

describe('EvalCaseCopyRequest / EvalSuiteStartRequest (skill evals)', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('copy request: uuid case_id only', () => {
    expect(EvalCaseCopyRequest.parse({ case_id: id })).toEqual({ case_id: id });
    expect(EvalCaseCopyRequest.safeParse({}).success).toBe(false);
    expect(EvalCaseCopyRequest.safeParse({ case_id: 'x' }).success).toBe(false);
    expect(EvalCaseCopyRequest.safeParse({ case_id: id, extra: 1 }).success).toBe(false);
  });

  it('start request: uuid agent_id only', () => {
    expect(EvalSuiteStartRequest.parse({ agent_id: id })).toEqual({ agent_id: id });
    expect(EvalSuiteStartRequest.safeParse({}).success).toBe(false);
    expect(EvalSuiteStartRequest.safeParse({ agent_id: 'x' }).success).toBe(false);
    expect(EvalSuiteStartRequest.safeParse({ agent_id: id, extra: 1 }).success).toBe(false);
  });
});

describe('client vendor/shared parity', () => {
  // The client's @devdigest/shared is a hand copy with no sync script (root
  // INSIGHTS 2026-07-29): these two files must stay byte-identical.
  const FILES = ['knowledge.ts', 'eval-ci.ts'];
  for (const file of FILES) {
    it(`client copy of contracts/${file} equals the server copy`, () => {
      const server = readFileSync(
        fileURLToPath(new URL(`../src/vendor/shared/contracts/${file}`, import.meta.url)),
        'utf8',
      );
      const client = readFileSync(
        fileURLToPath(new URL(`../../client/src/vendor/shared/contracts/${file}`, import.meta.url)),
        'utf8',
      );
      expect(client).toBe(server);
    });
  }
});
