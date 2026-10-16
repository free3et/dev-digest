import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type DbHandle } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

/**
 * Testcontainers helper: spin a Postgres + pgvector container, run migrations,
 * return a Drizzle client. Uses the same `pgvector/pgvector:pg16` image as
 * docker-compose so the `vector` extension is available.
 *
 * Integration tests gate on `dockerAvailable()` and skip cleanly when Docker is
 * not reachable (CI/sandbox without a Docker daemon).
 */
export interface PgFixture {
  container: StartedPostgreSqlContainer;
  handle: DbHandle;
  url: string;
  stop: () => Promise<void>;
}

let dockerCache: boolean | undefined;

/**
 * Cheap check: can we reach a Docker daemon?
 *
 * With `DEVDIGEST_REQUIRE_DOCKER` set (`pnpm verify:l06`) an unreachable daemon
 * THROWS instead of returning false, so the it-files' top-level await fails the
 * run rather than skipping silently. Never change `HOME` to dodge a real key:
 * `docker info` breaks without it (server INSIGHTS 2026-09-25).
 */
export async function dockerAvailable(): Promise<boolean> {
  if (dockerCache !== undefined) return dockerCache;
  try {
    const { execSync } = await import('node:child_process');
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    dockerCache = true;
  } catch {
    dockerCache = false;
  }
  if (!dockerCache && process.env.DEVDIGEST_REQUIRE_DOCKER) {
    throw new Error('verify:l06 requires Docker (docker info failed)');
  }
  return dockerCache;
}

export async function startPg(): Promise<PgFixture> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('devdigest')
    .withUsername('devdigest')
    .withPassword('devdigest')
    .start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url, { max: 5 });
  return {
    container,
    handle,
    url,
    stop: async () => {
      await handle.close();
      await container.stop();
    },
  };
}
