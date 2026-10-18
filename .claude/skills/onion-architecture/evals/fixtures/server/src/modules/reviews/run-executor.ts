import type { Container } from '../../platform/container.js';

export interface RunRecord {
  id: string;
  agentId: string;
  status: 'running' | 'completed' | 'failed';
  findingCount: number;
  costUsd: number;
}

export function buildRunSummary(run: RunRecord): string {
  const outcome = run.status === 'completed' ? 'finished' : run.status;
  return `Run ${run.id} ${outcome}: ${run.findingCount} finding(s), $${run.costUsd.toFixed(4)}`;
}

export async function executeRun(container: Container, runId: string): Promise<RunRecord> {
  const run = await container.reviewRepo.markRunning(runId);
  return run;
}
