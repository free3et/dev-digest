import type { GitHubClient, SecretsProvider } from '@devdigest/shared';
import type { Db } from '../db/client.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { ConfigError } from './errors.js';

export interface ContainerOverrides {
  github?: GitHubClient;
}

export class Container {
  private _github?: GitHubClient;
  private _reviewRepo?: ReviewRepository;

  constructor(
    readonly db: Db,
    readonly secrets: SecretsProvider,
    overrides: ContainerOverrides = {},
  ) {
    this._github = overrides.github;
  }

  get github(): GitHubClient {
    if (!this._github) throw new ConfigError('github_client_not_configured');
    return this._github;
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }
}
