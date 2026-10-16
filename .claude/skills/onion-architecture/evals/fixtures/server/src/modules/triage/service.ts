import type { Container } from '../../platform/container.js';
import { TriageRepository } from './repository.js';
import { planTriage, type TriageCandidate } from './helpers.js';
import { TRIAGE_BATCH_SIZE } from './constants.js';

export interface ApplyTriageInput {
  actor: string;
  candidates: TriageCandidate[];
}

export class TriageService {
  constructor(
    private repo: TriageRepository,
    private container: Container,
  ) {}

  static fromContainer(container: Container): TriageService {
    return new TriageService(new TriageRepository(container.db), container);
  }

  async applyTriage(workspaceId: string, input: ApplyTriageInput) {
    const plan = planTriage(input.candidates.slice(0, TRIAGE_BATCH_SIZE));
    if (plan.ids.length === 0) return { triaged: 0 };

    await this.container.db.transaction(async (tx) => {
      await this.repo.markTriaged(plan.ids, plan.status, tx);
      await this.repo.insertAudit({
        workspaceId,
        actor: input.actor,
        count: plan.ids.length,
        status: plan.status,
      });
      await this.repo.bumpCounters(workspaceId, plan.ids.length, tx);
    });

    return { triaged: plan.ids.length };
  }
}
