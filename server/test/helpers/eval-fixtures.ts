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
  makeSkill(o?: {
    ws?: string;
    name?: string;
    body?: string;
    source?: 'manual' | 'imported_url' | 'imported_file' | 'extracted' | 'community';
    enabled?: boolean;
    version?: number;
  }): Promise<{ id: string; name: string; body: string; version: number }>;
  /** Links a skill to an agent (`agent_skills`). */
  linkSkill(agentId: string, skillId: string, o?: { enabled?: boolean; order?: number }): Promise<void>;
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

    async makeSkill(o = {}) {
      const n = ++seq;
      const [row] = await db
        .insert(t.skills)
        .values({
          workspaceId: o.ws ?? workspaceId,
          name: o.name ?? `Fixture skill ${n}`,
          description: 'd',
          type: 'custom',
          source: o.source ?? 'manual',
          body: o.body ?? `Body of fixture skill ${n}`,
          enabled: o.enabled ?? true,
          version: o.version ?? 1,
        })
        .returning();
      return { id: row!.id, name: row!.name, body: row!.body, version: row!.version };
    },

    async linkSkill(agentId, skillId, o = {}) {
      await db
        .insert(t.agentSkills)
        .values({ agentId, skillId, order: o.order ?? 0, enabled: o.enabled ?? true });
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
