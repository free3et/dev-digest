import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ConventionCandidate, ConventionExtractResult, ConventionSkillDraft } from '@devdigest/shared';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SRC = ['export function fooBar() {', '  throw new AppError("bad", 400);', '}'].join('\n');
const TEST = ['it("uses renderWithProviders", () => {', '  renderWithProviders(<X />);', '});'].join('\n');
const FILES = {
  'src/a.ts': SRC,
  'src/a.test.ts': TEST,
  'package.json': '{ "name": "demo", "type": "module" }',
};

const proposal = (over: Record<string, unknown>) => ({
  rule: 'r', evidence_path: 'src/a.ts', evidence_snippet: 'throw new AppError("bad", 400);',
  evidence_line: 2, occurrences: 2, category: 'errors', confidence: 0.7, ...over,
});

d('conventions module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'demo', fullName: 'acme/demo' })
      .returning();
    repoId = repo!.id;
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            proposal({ rule: 'Throw AppError', evidence_line: 40 }), // wrong line → corrected
            proposal({ rule: 'Invented', evidence_snippet: 'this code does not exist anywhere' }), // dropped
            proposal({ rule: 'Unsampled', evidence_path: 'src/nope.ts' }), // dropped
            proposal({
              rule: 'Wrap renders in renderWithProviders',
              evidence_path: 'src/a.test.ts',
              evidence_snippet: 'renderWithProviders(<X />);',
              evidence_line: 2,
              category: 'testing',
            }),
          ],
        },
      },
    });
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ files: FILES }),
        repoIntel: {
          getConventionSamples: async () => ['src/a.ts'],
          getConventionTestSamples: async () => ['src/a.test.ts'],
        } as unknown as RepoIntel,
        llm: { openai: llm, anthropic: llm, openrouter: llm },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('extract stores only grounded rows, corrects the line, counts the drops', async () => {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ConventionExtractResult;
    expect(body.proposed).toBe(4);
    expect(body.dropped_ungrounded).toBe(2);
    expect(body.candidates).toHaveLength(2);
    const errors = body.candidates.find((c) => c.category === 'errors')!;
    expect(errors.evidence_line).toBe(2);
    expect(SRC.includes(errors.evidence_snippet)).toBe(true);
    const testing = body.candidates.find((c) => c.category === 'testing')!;
    expect(testing.evidence_path).toBe('src/a.test.ts');
    expect(TEST.includes(testing.evidence_snippet)).toBe(true);
  });

  it('a re-scan replaces pending rows but never touches an accepted one', async () => {
    const [row] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionCandidate[];
    const patched = await app.inject({ method: 'PATCH', url: `/conventions/${row!.id}`, payload: { accepted: true, category: 'api' } });
    expect((patched.json() as ConventionCandidate).category).toBe('api');

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const all = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionCandidate[];
    expect(all).toHaveLength(3);
    expect(all.filter((c) => c.accepted).map((c) => c.id)).toEqual([row!.id]);
  });

  it('skill draft uses accepted rows only; reject deletes', async () => {
    const draft = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill` })).json() as ConventionSkillDraft;
    expect(draft.name).toBe('repo-conventions');
    expect(draft.convention_ids).toHaveLength(1);

    const pending = (await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.accepted, false)))[0]!;
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${pending.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${pending.id}` })).statusCode).toBe(404);
  });
});
