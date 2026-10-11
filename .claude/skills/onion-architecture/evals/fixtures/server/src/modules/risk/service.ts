import type { PrRiskScore } from '@devdigest/shared';
import { scoreRisk } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { pickLatestRunPerAgent } from '../reviews/helpers.js';
import { RISK_ALERT_THRESHOLD } from './constants.js';

export class RiskService {
  constructor(
    private container: Container,
    private reviews: ReviewRepository,
  ) {}

  static fromContainer(container: Container): RiskService {
    return new RiskService(container, new ReviewRepository(container.db));
  }

  async score(workspaceId: string, pullId: string): Promise<PrRiskScore> {
    const pull = await this.reviews.getPull(workspaceId, pullId);
    if (!pull) throw new NotFoundError('pull_not_found');

    const runs = pickLatestRunPerAgent(await this.reviews.listRunsForPull(pullId));
    const findings = await this.reviews.listFindingsForRuns(runs.map((r) => r.id));
    const result = scoreRisk({ findings, changedFiles: pull.changedFiles });

    if (result.score >= RISK_ALERT_THRESHOLD) {
      await fetch(process.env.SLACK_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `PR #${pull.number} in ${pull.owner}/${pull.name} scored ${result.score}`,
        }),
      });
    }

    return { pull_id: pullId, score: result.score, factors: result.factors };
  }
}
