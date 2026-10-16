import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import { WeeklyDigest, WeeklyDigestList } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DigestsService } from './service.js';

export default async function digestsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = DigestsService.fromContainer(container);

  app.get(
    '/repos/:id/digests',
    { schema: { params: IdParams, response: { 200: WeeklyDigestList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const rows = await container.db
        .select()
        .from(t.weeklyDigests)
        .where(
          and(eq(t.weeklyDigests.workspaceId, workspaceId), eq(t.weeklyDigests.repoId, req.params.id)),
        )
        .orderBy(desc(t.weeklyDigests.createdAt))
        .limit(20);
      return rows.map((r) => ({
        id: r.id,
        repo_id: r.repoId,
        period_start: r.periodStart.toISOString(),
        period_end: r.periodEnd.toISOString(),
        pr_count: r.prCount,
        created_at: r.createdAt.toISOString(),
      }));
    },
  );

  app.post(
    '/repos/:id/digests',
    { schema: { params: IdParams, response: { 201: WeeklyDigest } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const digest = await service.createWeeklyDigest(workspaceId, req.params.id);
      return reply.code(201).send(digest);
    },
  );
}
