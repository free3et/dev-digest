import { eq } from 'drizzle-orm';
import type { PgFixture } from './pg.js';
import * as t from '../../src/db/schema.js';

/**
 * Fixture builders shared by the Spec C eval-case modal it-tests. A COPY of
 * the local helpers in `eval-cases.it.test.ts` on purpose: that file is
 * Spec A's AC-8 evidence and stays untouched (plan P5).
 */

export const PATCH =
  '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

export interface FixtureOpts {
  ws?: string;
  /** undefined / null = no agent on the review. */
  agentId?: string | null;
  decided?: 'accepted' | 'dismissed' | null;
  /** null = no pr_files row. */
  patch?: string | null;
  file?: string;
  start?: number;
  end?: number;
  title?: string;
  prBody?: string | null;
  prTitle?: string;
}

export interface EvalFixtures {
  workspaceId: string;
  foreignWorkspaceId: string;
  makeAgent(
    o?: { ws?: string; provider?: 'openai' | 'anthropic' | 'openrouter'; systemPrompt?: string },
  ): Promise<string>;
  makeFinding(o?: FixtureOpts): Promise<{ findingId: string; reviewId: string; prId: string; repoName: string }>;
  /** Deletes nothing; resolves the seeded default workspace and a foreign one. */
}

export async function evalFixtures(pg: PgFixture): Promise<EvalFixtures> {
  const db = pg.handle.db;
  const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'Default'));
  const workspaceId = ws?.id ?? (await db.select().from(t.workspaces))[0]!.id;
  const [foreign] = await db.insert(t.workspaces).values({ name: 'Foreign' }).returning();
  const foreignWorkspaceId = foreign!.id;
  let seq = 0;

  return {
    workspaceId,
    foreignWorkspaceId,

    async makeAgent(o = {}) {
      const [a] = await db
        .insert(t.agents)
        .values({
          workspaceId: o.ws ?? workspaceId,
          name: `Modal agent ${++seq}`,
          provider: o.provider ?? 'openai',
          model: 'gpt-4.1',
          systemPrompt: o.systemPrompt ?? 'review',
        })
        .returning();
      return a!.id;
    },

    async makeFinding(o = {}) {
      const w = o.ws ?? workspaceId;
      const file = o.file ?? 'src/config.ts';
      const name = `modalrepo-${++seq}`;
      const [repo] = await db
        .insert(t.repos)
        .values({ workspaceId: w, owner: 'acme', name, fullName: `acme/${name}` })
        .returning();
      const [pr] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId: w,
          repoId: repo!.id,
          number: 700 + seq,
          title: o.prTitle ?? 'Add rate limiting',
          author: 'a',
          branch: 'feat',
          base: 'main',
          headSha: 'sha-1',
          body: o.prBody === undefined ? 'PR body text' : o.prBody,
        })
        .returning();
      if (o.patch !== null) {
        await db.insert(t.prFiles).values({ prId: pr!.id, path: file, patch: o.patch ?? PATCH });
      }
      const [review] = await db
        .insert(t.reviews)
        .values({ workspaceId: w, prId: pr!.id, agentId: o.agentId ?? null, kind: 'review' })
        .returning();
      const [finding] = await db
        .insert(t.findings)
        .values({
          reviewId: review!.id,
          file,
          startLine: o.start ?? 11,
          endLine: o.end ?? 12,
          severity: 'CRITICAL',
          category: 'security',
          title: o.title ?? 'Hard-coded Stripe key',
          rationale: 'because',
          confidence: 0.9,
          acceptedAt: o.decided === 'accepted' ? new Date() : null,
          dismissedAt: o.decided === 'dismissed' ? new Date() : null,
        })
        .returning();
      return { findingId: finding!.id, reviewId: review!.id, prId: pr!.id, repoName: name };
    },
  };
}
