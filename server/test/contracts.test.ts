import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  BlastRadiusResponse,
  BlastDegradedReason,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  ContextDocWrite,
  CONTEXT_DOC_MAX_BYTES,
  ContextDocsUpdate,
  ContextAttachment,
  PrBrief,
  PrBriefResponse,
  BriefModelOutput,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('SmartDiff accepts tests/docs roles and rejects unknown ones', () => {
    const base = { split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] } };
    const file = { path: 'a', additions: 1, deletions: 0, finding_lines: [] };
    for (const role of ['tests', 'docs']) {
      expect(() => SmartDiff.parse({ ...base, groups: [{ role, files: [file] }] })).not.toThrow();
    }
    expect(() => SmartDiff.parse({ ...base, groups: [{ role: 'other', files: [file] }] })).toThrow();
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.23, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('BlastRadiusResponse', () => {
  const base = {
    changed_symbols: [{ name: 'f', file: 'a.ts', kind: 'function' }],
    downstream: [],
    summary: 's',
    degraded: false,
    reason: null,
    impacted_endpoints: ['GET /x'],
  };
  it('parses a normal and a degraded response', () => {
    expect(() => BlastRadiusResponse.parse(base)).not.toThrow();
    expect(() => BlastRadiusResponse.parse({ ...base, degraded: true, reason: 'no_data' })).not.toThrow();
  });
  it('rejects an unknown reason and a missing field', () => {
    expect(() => BlastRadiusResponse.parse({ ...base, reason: 'bogus' })).toThrow();
    expect(BlastDegradedReason.safeParse('bogus').success).toBe(false);
    const { impacted_endpoints: _omit, ...rest } = base;
    expect(() => BlastRadiusResponse.parse(rest)).toThrow();
  });
});

describe('ContextDocWrite byte cap', () => {
  const w = (content: string) => ContextDocWrite.safeParse({ path: 'docs/a.md', content, base_hash: 'h' });
  it('accepts exactly the cap in bytes', () => {
    expect(CONTEXT_DOC_MAX_BYTES).toBe(262_144);
    expect(w('a'.repeat(262_144)).success).toBe(true);
  });
  it('rejects one byte over', () => {
    expect(w('a'.repeat(262_145)).success).toBe(false);
  });
  it('counts UTF-8 bytes, not UTF-16 units', () => {
    // 3 bytes each: 87_382 * 3 = 262_146 > cap, 87_381 * 3 = 262_143 fits
    expect(w('\u20ac'.repeat(87_382)).success).toBe(false);
    expect(w('\u20ac'.repeat(87_381)).success).toBe(true);
  });
});

describe('project context attach contracts', () => {
  const repo_id = '11111111-1111-4111-8111-111111111111';
  it('ContextDocsUpdate rejects duplicate paths', () => {
    expect(ContextDocsUpdate.safeParse({ repo_id, paths: ['docs/a.md', 'docs/a.md'] }).success).toBe(false);
    expect(ContextDocsUpdate.safeParse({ repo_id, paths: ['docs/a.md', 'docs/b.md'] }).success).toBe(true);
  });
  it('ContextAttachment invariants: too_large only when not missing, tokens null when flagged', () => {
    const base = { path: 'docs/a.md', doc_type: 'docs' as const };
    expect(ContextAttachment.safeParse({ ...base, approx_tokens: null, missing: true, too_large: true }).success).toBe(false);
    expect(ContextAttachment.safeParse({ ...base, approx_tokens: 5, missing: false, too_large: true }).success).toBe(false);
    expect(ContextAttachment.safeParse({ ...base, approx_tokens: null, missing: false, too_large: true }).success).toBe(true);
    expect(ContextAttachment.safeParse({ ...base, approx_tokens: 5, missing: false, too_large: false }).success).toBe(true);
  });
  it('RunTrace without specs_tokens / specs_missing still parses (EC-5)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'a', version: 'v1', model: 'm', pr: 1, source: 'local' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.specs_tokens).toBeUndefined();
    expect(trace.specs_missing).toBeUndefined();
  });
});

describe('PrBrief contracts', () => {
  const brief = {
    summary: 'Adds X.',
    risks: { risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: ['a.ts'] }] },
    review_focus: [{ file: 'a.ts', line: 3, reason: 'r' }, { file: 'b.ts', line: null, reason: 'r2' }],
    intent: { intent: 'i', in_scope: [], out_of_scope: [] },
    blast: { changed_symbols: [], downstream: [], summary: 's' },
    head_sha: 'abc',
    generated_at: '2026-10-07T00:00:00.000Z',
    model: 'gpt-x',
    cost_usd: 0.01,
    missing_inputs: ['smart_diff'],
    intent_stale: false,
    truncated_inputs: ['intent', 'blast_callers'],
  };
  it('parses a full brief and one with null intent/blast/cost', () => {
    expect(() => PrBrief.parse(brief)).not.toThrow();
    expect(() =>
      PrBrief.parse({ ...brief, intent: null, blast: null, cost_usd: null, missing_inputs: ['intent', 'blast'] }),
    ).not.toThrow();
  });
  it('rejects an unknown missing input and a stored history field is not required', () => {
    expect(PrBrief.safeParse({ ...brief, missing_inputs: ['bogus'] }).success).toBe(false);
    expect('history' in PrBrief.shape).toBe(false);
  });
  it('BriefModelOutput declares risks, review_focus, summary in order with no optional field', () => {
    expect(Object.keys(BriefModelOutput.shape)).toEqual(['risks', 'review_focus', 'summary']);
    for (const f of Object.values(BriefModelOutput.shape)) expect(f.isOptional()).toBe(false);
    const out = { risks: brief.risks.risks, review_focus: brief.review_focus, summary: 's' };
    expect(() => BriefModelOutput.parse(out)).not.toThrow();
  });
  it('PrBriefResponse parses {brief:null, stale:false} and a stale brief', () => {
    expect(PrBriefResponse.parse({ brief: null, stale: false })).toEqual({ brief: null, stale: false });
    expect(PrBriefResponse.parse({ brief, stale: true }).stale).toBe(true);
    expect(PrBriefResponse.safeParse({ brief: null }).success).toBe(false);
  });
});
