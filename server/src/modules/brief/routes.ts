import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBrief, PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * brief module.
 *   GET  /pulls/:id/brief → stored PR brief + stale flag (no LLM)
 *   POST /pulls/:id/brief → (re)generate the brief (409 brief_unavailable | brief_in_progress)
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = BriefService.fromContainer(container);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  // Tight limit: every call is a paid LLM request.
  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBrief } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}
