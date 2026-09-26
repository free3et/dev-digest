import { MAX_SNIPPET_LINES, MIN_SNIPPET_CHARS } from './constants.js';
import type { ProposedCandidate } from './prompt.js';

export interface GroundedCandidate {
  rule: string;
  category: ProposedCandidate['category'];
  confidence: number;
  evidence_path: string;
  /** Sliced from the file, never the model's reply. */
  evidence_snippet: string;
  /** 1-based, recomputed from the file. */
  evidence_line: number;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** All 0-based line indexes where `snippet` (whole lines, trim-insensitive) starts in `lines`. */
function findStarts(lines: string[], snippet: string): { starts: number[]; span: number } {
  const want = snippet.split('\n').map((l) => l.trim());
  while (want.length && want[0] === '') want.shift();
  while (want.length && want[want.length - 1] === '') want.pop();
  const starts: number[] = [];
  if (want.length === 0) return { starts, span: 1 };
  if (want.length === 1) {
    // Single line: substring match, the model may quote part of a line.
    lines.forEach((l, i) => l.includes(want[0]!) && starts.push(i));
    return { starts, span: 1 };
  }
  for (let i = 0; i + want.length <= lines.length; i++) {
    if (want.every((w, k) => lines[i + k]!.trim() === w)) starts.push(i);
  }
  return { starts, span: want.length };
}

/**
 * Grounding gate for ONE candidate. Returns null when it must be dropped:
 * the path was not sampled, the snippet is not substantial, or it does not occur
 * in the file. A wrong `evidence_line` is corrected (nearest occurrence to the
 * claimed line); the stored snippet is sliced from the file.
 */
export function groundCandidate(
  c: ProposedCandidate,
  sampled: ReadonlySet<string>,
  content: string | undefined,
): GroundedCandidate | null {
  if (!sampled.has(c.evidence_path) || content === undefined) return null;
  if (c.evidence_snippet.trim().length < MIN_SNIPPET_CHARS) return null;

  const lines = content.split('\n');
  const { starts, span: matched } = findStarts(lines, c.evidence_snippet);
  if (starts.length === 0) return null;

  const claimed = c.evidence_line - 1;
  const start = starts.reduce((best, s) => (Math.abs(s - claimed) < Math.abs(best - claimed) ? s : best));
  const span = Math.min(matched, MAX_SNIPPET_LINES);

  return {
    rule: c.rule.trim(),
    category: c.category,
    confidence: c.confidence,
    evidence_path: c.evidence_path,
    evidence_snippet: lines.slice(start, start + span).join('\n'),
    evidence_line: start + 1,
  };
}

/**
 * Run the gate over a whole reply. `read` re-reads a file (the spec's "the file
 * is re-read"). Duplicates (same rule text) collapse to the first one.
 */
export async function groundAll(
  proposed: ProposedCandidate[],
  sampled: ReadonlySet<string>,
  read: (path: string) => Promise<string | undefined>,
): Promise<{ kept: GroundedCandidate[]; dropped: number }> {
  const cache = new Map<string, string | undefined>();
  const seen = new Set<string>();
  const kept: GroundedCandidate[] = [];
  let dropped = 0;
  for (const c of proposed) {
    let content: string | undefined;
    if (sampled.has(c.evidence_path)) {
      if (!cache.has(c.evidence_path)) cache.set(c.evidence_path, await read(c.evidence_path));
      content = cache.get(c.evidence_path);
    }
    const g = groundCandidate(c, sampled, content);
    if (!g) {
      dropped++;
      continue;
    }
    const key = norm(g.rule);
    if (!key || seen.has(key)) continue; // duplicate: collapsed, not "ungrounded"
    seen.add(key);
    kept.push(g);
  }
  return { kept, dropped };
}
