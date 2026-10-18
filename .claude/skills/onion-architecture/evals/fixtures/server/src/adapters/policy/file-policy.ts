import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TriagePolicy {
  autoCloseSuggestions: boolean;
  staleAfterDays: number;
}

export function loadTriagePolicy(root = process.cwd()): TriagePolicy {
  const raw = readFileSync(join(root, '.devdigest', 'triage.json'), 'utf8');
  return JSON.parse(raw) as TriagePolicy;
}
