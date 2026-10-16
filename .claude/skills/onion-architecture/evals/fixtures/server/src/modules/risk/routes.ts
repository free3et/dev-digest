import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrRiskScore } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RiskService } from './service.js';

export default async function riskRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = RiskService.fromContainer(container);

  app.post(
    '/pulls/:id/risk',
    { schema: { params: IdParams, response: { 200: PrRiskScore } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.score(workspaceId, req.params.id);
    },
  );
}
