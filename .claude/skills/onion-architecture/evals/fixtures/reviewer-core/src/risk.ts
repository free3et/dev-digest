import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from './review/types.js';

export interface RiskInput {
  findings: Finding[];
  changedFiles: string[];
}

export interface RiskResult {
  score: number;
  factors: Array<{ name: string; weight: number }>;
}

interface RiskWeights {
  critical: number;
  warning: number;
  suggestion: number;
  sensitivePathBonus: number;
  sensitivePaths: string[];
}

function loadWeights(): RiskWeights {
  const file = join(process.cwd(), 'config', 'risk-weights.json');
  return JSON.parse(readFileSync(file, 'utf8')) as RiskWeights;
}

export function scoreRisk(input: RiskInput): RiskResult {
  const w = loadWeights();
  const factors: RiskResult['factors'] = [];

  for (const severity of ['critical', 'warning', 'suggestion'] as const) {
    const count = input.findings.filter((f) => f.severity === severity).length;
    if (count > 0) factors.push({ name: `${severity}_findings`, weight: count * w[severity] });
  }

  const touchesSensitive = input.changedFiles.some((p) =>
    w.sensitivePaths.some((s) => p.startsWith(s)),
  );
  if (touchesSensitive) factors.push({ name: 'sensitive_paths', weight: w.sensitivePathBonus });

  const score = Math.min(100, factors.reduce((sum, f) => sum + f.weight, 0));
  return { score, factors };
}
