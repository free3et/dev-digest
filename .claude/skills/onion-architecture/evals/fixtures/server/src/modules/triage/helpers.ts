import { loadTriagePolicy, type TriagePolicy } from '../../adapters/policy/file-policy.js';
import type { TriageStatus } from './constants.js';

export interface TriageCandidate {
  id: string;
  severity: 'suggestion' | 'warning' | 'critical';
  ageDays: number;
}

export interface TriagePlan {
  ids: string[];
  status: TriageStatus;
}

export function planTriage(
  candidates: TriageCandidate[],
  overrides: Partial<TriagePolicy> = {},
): TriagePlan {
  const policy = { ...loadTriagePolicy(), ...overrides };
  const stale = candidates.filter((c) => c.ageDays >= policy.staleAfterDays);
  const closable = policy.autoCloseSuggestions
    ? stale.filter((c) => c.severity === 'suggestion')
    : [];
  return { ids: closable.map((c) => c.id), status: 'dismissed' };
}
