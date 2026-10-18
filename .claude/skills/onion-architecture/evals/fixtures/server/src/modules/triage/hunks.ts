import { parseHunks } from '../../adapters/git/parse-hunks.js';

export function touchedLines(patch: string): Set<number> {
  const lines = new Set<number>();
  for (const h of parseHunks(patch)) {
    for (let n = h.newStart; n < h.newStart + h.newLines; n += 1) lines.add(n);
  }
  return lines;
}

export function findingIsOnChangedLine(patch: string, line: number): boolean {
  return touchedLines(patch).has(line);
}
