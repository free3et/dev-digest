import type { WeeklyDigest } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
import { DigestsRepository } from './repository.js';
import { DIGEST_WINDOW_DAYS } from './constants.js';
import { toDigestDto, toDigestItemRows } from './helpers.js';

export class DigestsService {
  constructor(
    private repo: DigestsRepository,
    private container: Container,
  ) {}

  static fromContainer(container: Container): DigestsService {
    return new DigestsService(new DigestsRepository(container.db), container);
  }

  async createWeeklyDigest(workspaceId: string, repoId: string): Promise<WeeklyDigest> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('repo_not_found');

    const token = await this.container.secrets.get('github_token');
    const github = new OctokitGitHubClient(token ?? '');

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - DIGEST_WINDOW_DAYS * 86_400_000);
    const merged = await github.listMergedPulls(repo.owner, repo.name, { since: periodStart });

    const digest = await this.repo.insertDigest({
      workspaceId,
      repoId,
      periodStart,
      periodEnd,
      prCount: merged.length,
    });
    await this.repo.insertDigestItems(toDigestItemRows(digest.id, merged));
    await this.repo.markPullsDigested(
      repoId,
      merged.map((p) => p.number),
      digest.id,
    );

    return toDigestDto(digest, merged);
  }
}
