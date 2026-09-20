import { describe, it, expect } from 'vitest';
import { groundAll, groundCandidate } from '../src/modules/conventions/grounding.js';
import { ExtractionSchema, renderFile, type ProposedCandidate } from '../src/modules/conventions/prompt.js';
import { buildSkillDraft } from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/db/rows.js';

const FILE = [
  "import { z } from 'zod';",
  '',
  'export function fooBar() {',
  '  throw new AppError("bad", 400);',
  '}',
].join('\n');
const SAMPLED = new Set(['src/a.ts']);

const cand = (p: Partial<ProposedCandidate> = {}): ProposedCandidate => ({
  rule: 'Throw AppError, never bare Error',
  evidence_path: 'src/a.ts',
  evidence_snippet: 'throw new AppError("bad", 400);',
  evidence_line: 4,
  occurrences: 3,
  category: 'errors',
  confidence: 0.8,
  ...p,
});

describe('conventions grounding gate (hermetic)', () => {
  it('keeps a real snippet and stores the file slice', () => {
    const g = groundCandidate(cand(), SAMPLED, FILE)!;
    expect(g.evidence_line).toBe(4);
    expect(FILE.includes(g.evidence_snippet)).toBe(true);
  });

  it('corrects a wrong line number', () => {
    expect(groundCandidate(cand({ evidence_line: 99 }), SAMPLED, FILE)!.evidence_line).toBe(4);
  });

  it('drops an invented snippet', () => {
    expect(groundCandidate(cand({ evidence_snippet: 'throw new TotallyMadeUp(1, 2, 3);' }), SAMPLED, FILE)).toBeNull();
  });

  it('drops a path that was not sampled and a too-short snippet', () => {
    expect(groundCandidate(cand({ evidence_path: 'src/other.ts' }), SAMPLED, FILE)).toBeNull();
    expect(groundCandidate(cand({ evidence_snippet: 'x' }), SAMPLED, FILE)).toBeNull();
  });

  it('slices a multi-line snippet from the file, whatever indentation the model used', () => {
    const g = groundCandidate(
      cand({ evidence_snippet: 'export function fooBar() {\nthrow new AppError("bad", 400);', evidence_line: 1 }),
      SAMPLED,
      FILE,
    )!;
    expect(g.evidence_line).toBe(3);
    expect(g.evidence_snippet).toBe(FILE.split('\n').slice(2, 4).join('\n'));
  });

  it('counts drops, collapses duplicate rules, reads each file once', async () => {
    let reads = 0;
    const { kept, dropped } = await groundAll(
      [cand(), cand({ rule: ' throw APPERROR, never bare error ' }), cand({ rule: 'Other', evidence_snippet: 'nope nope nope nope' })],
      SAMPLED,
      async () => (reads++, FILE),
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(1);
    expect(reads).toBe(1);
  });
});

describe('conventions prompt + skill draft', () => {
  it('declares category and confidence AFTER the evidence fields', () => {
    const keys = Object.keys(ExtractionSchema.shape.candidates.element.shape);
    expect(keys).toEqual([
      'rule', 'evidence_path', 'evidence_snippet', 'evidence_line', 'occurrences', 'category', 'confidence',
    ]);
  });

  it('renders a 1-based line gutter', () => {
    expect(renderFile('a.ts', 'x\ny')).toBe('=== a.ts ===\n1 | x\n2 | y');
  });

  it('builds the draft grouped by category', () => {
    const row = (id: string, category: ConventionRow['category'], rule: string): ConventionRow => ({
      id, workspaceId: 'w', repoId: 'r', rule, category, evidencePath: 'src/a.ts',
      evidenceSnippet: 's', evidenceLine: 4, confidence: 0.9, accepted: true,
    });
    const d = buildSkillDraft([row('1', 'errors', 'Use AppError'), row('2', 'naming', 'kebab-case files')]);
    expect(d.name).toBe('repo-conventions');
    expect(d.body.indexOf('## naming')).toBeLessThan(d.body.indexOf('## errors'));
    expect(d.convention_ids).toEqual(['2', '1']);
    expect(d.evidence_files).toEqual(['src/a.ts']);
  });
});
