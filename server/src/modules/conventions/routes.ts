import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionUpdate,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module.
 *   GET    /repos/:id/conventions          → stored candidates
 *   POST   /repos/:id/conventions/extract  → sample → propose → verify → replace pending rows
 *   POST   /repos/:id/conventions/skill    → ConventionSkillDraft from accepted rows; STORES NOTHING
 *   PATCH  /conventions/:id                → accept / edit rule / category
 *   DELETE /conventions/:id                → reject (deletes the row)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Built on first request, not at plugin registration.
  let service: ConventionsService | undefined;
  const svc = () => (service ??= new ConventionsService(app.container));

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: z.array(ConventionCandidate) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return svc().list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams, response: { 200: ConventionExtractResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return svc().extract(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, response: { 200: ConventionSkillDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return svc().skillDraft(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionUpdate, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return svc().update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await svc().remove(workspaceId, req.params.id);
    return reply.status(204).send();
  });
}
