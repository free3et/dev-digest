import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';
import { MAX_FILE_CHARS } from './constants.js';

/**
 * ORDER OF THESE FIELDS IS GENERATION ORDER. Evidence and `occurrences` come
 * first; `category` and `confidence` are classification/score fields and go
 * LAST. Declared before `rule`, a live scan labelled every candidate `imports`
 * at exactly 0.90; declared after the evidence, the same model produced five
 * distinct categories and confidences from 0.50 to 0.95 (server/INSIGHTS.md,
 * "What Works"). Do not reorder.
 */
export const ExtractionSchema = z.object({
  candidates: z.array(
    z.object({
      rule: z.string(),
      evidence_path: z.string(),
      evidence_snippet: z.string(),
      evidence_line: z.number().int(),
      occurrences: z.number().int(),
      category: ConventionCategory,
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type ExtractionOutput = z.infer<typeof ExtractionSchema>;
export type ProposedCandidate = ExtractionOutput['candidates'][number];

export const SYSTEM_PROMPT = `You extract the unwritten house rules a codebase already follows, so a code reviewer can enforce them.

You are given a sample of files. Each line is prefixed with its 1-based line number and a "| " gutter; the gutter is NOT part of the code.

For each rule:
- State it as one imperative sentence a reviewer could check ("Use kebab-case file names").
- Cite ONE file from the sample as evidence: evidence_path exactly as shown in its header.
- evidence_snippet must be copied VERBATIM from that file (no gutter, no ellipsis, no paraphrase). Prefer 1-4 lines.
- evidence_line is the 1-based line where the snippet starts.
- occurrences is how many sampled files follow the rule.
- category is one of: naming, structure, errors, testing, imports, typing, api, general.
- confidence reflects how consistently the rule is followed (0-1).

Only propose rules you can prove from the sample. Skip generic advice. Never cite a file that is not in the sample.`;

/** Render a file with a 1-based line-number gutter so the model can cite a line. */
export function renderFile(path: string, content: string): string {
  const clipped = content.length > MAX_FILE_CHARS ? content.slice(0, MAX_FILE_CHARS) : content;
  const lines = clipped.split('\n');
  const width = String(lines.length).length;
  const body = lines.map((l, i) => `${String(i + 1).padStart(width)} | ${l}`).join('\n');
  return `=== ${path} ===\n${body}${content.length > MAX_FILE_CHARS ? '\n[truncated]' : ''}`;
}
