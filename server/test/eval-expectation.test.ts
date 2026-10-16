import { describe, it, expect } from 'vitest';
import { EvalExpectation as EvalExpectationSchema } from '@devdigest/shared';
import { buildExpectation, decidedKind } from '../src/modules/eval/helpers.js';
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
    pr_body: null,
    head_sha: 'abc123',
    repo: 'acme/api',
    patch: '@@ -1 +1 @@',
    ...over,
  };
}

const T0 = new Date('2026-10-12T10:00:00.000Z');
const T1 = new Date('2026-10-12T10:05:00.000Z');

describe('decidedKind (accepted -> must_find, dismissed -> must_not_flag)', () => {
  it('maps a decision to the expectation kind', () => {
    expect(decidedKind({ accepted_at: T0, dismissed_at: null })).toBe('must_find');
    expect(decidedKind({ accepted_at: null, dismissed_at: T0 })).toBe('must_not_flag');
  });

  it('returns null for an undecided finding (the service refuses it)', () => {
    expect(decidedKind({ accepted_at: null, dismissed_at: null })).toBeNull();
  });

  it('when both are set the later decision wins; a tie goes to must_find', () => {
    expect(decidedKind({ accepted_at: T1, dismissed_at: T0 })).toBe('must_find');
    expect(decidedKind({ accepted_at: T0, dismissed_at: T1 })).toBe('must_not_flag');
    expect(decidedKind({ accepted_at: T0, dismissed_at: T0 })).toBe('must_find');
  });
});

describe('buildExpectation', () => {
  it('freezes location, informational fields and provenance, and satisfies the contract', () => {
    const e = buildExpectation(scope(), 'must_find', 'ag-1');
    expect(e).toEqual({
      kind: 'must_find',
      file: 'src/auth.ts',
      start_line: 12,
      end_line: 15,
      title: 'Token compared with ==',
      severity: 'CRITICAL',
      category: 'security',
      source: {
        finding_id: 'f-1',
        review_id: 'rev-1',
        pr_id: 'pr-1',
        repo: 'acme/api',
        head_sha: 'abc123',
        agent_id: 'ag-1',
        run_id: 'run-1',
      },
    });
    expect(EvalExpectationSchema.safeParse(e).success).toBe(true);
  });

  it('takes the kind and the agent id from its arguments, not from the finding', () => {
    const e = buildExpectation(scope({ agent_id: 'other-agent' }), 'must_not_flag', 'ag-9');
    expect(e.kind).toBe('must_not_flag');
    expect(e.source.agent_id).toBe('ag-9');
  });

  it('keeps a null run_id in the provenance', () => {
    const e = buildExpectation(scope({ run_id: null }), 'must_find', 'ag-1');
    expect(e.source.run_id).toBeNull();
    expect(EvalExpectationSchema.safeParse(e).success).toBe(true);
  });
});
