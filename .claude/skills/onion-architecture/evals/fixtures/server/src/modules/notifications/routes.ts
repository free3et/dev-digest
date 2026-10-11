import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NotificationQueued } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { AgentIdParams } from '../agents/schemas.js';
import { NotificationsService } from './service.js';

export default async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = NotificationsService.fromContainer(container);

  app.post(
    '/agents/:id/notifications',
    { schema: { params: AgentIdParams, response: { 202: NotificationQueued } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const queued = await service.queueLatestRunDigest(workspaceId, req.params.id);
      return reply.code(202).send({ id: queued.id });
    },
  );
}
