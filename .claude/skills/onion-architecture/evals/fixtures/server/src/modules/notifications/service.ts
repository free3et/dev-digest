import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildRunSummary } from '../reviews/run-executor.js';
import { NotificationsRepository } from './repository.js';
import { MAX_SUMMARY_LENGTH } from './constants.js';

export class NotificationsService {
  constructor(
    private repo: NotificationsRepository,
    private container: Container,
  ) {}

  static fromContainer(container: Container): NotificationsService {
    return new NotificationsService(new NotificationsRepository(container.db), container);
  }

  async queueLatestRunDigest(workspaceId: string, agentId: string) {
    const run = await this.container.reviewRepo.getLatestRun(workspaceId, agentId);
    if (!run) throw new NotFoundError('run_not_found');

    const summary = buildRunSummary(run).slice(0, MAX_SUMMARY_LENGTH);
    return this.repo.enqueue({ workspaceId, runId: run.id, summary });
  }
}
