import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContextDocList, ContextDocWrite, ContextFileQuery, SpecFile } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

/** The 256 KiB content cap is checked in UTF-8 bytes by the schema; JSON escaping can inflate the body ~6x. */
const PUT_BODY_LIMIT = 2 * 1024 * 1024;

/**
 * Project Context module (repository docs in the clone working tree).
 *   GET /repos/:id/context              → ContextDocList (no content)
 *   GET /repos/:id/context/file?path=   → SpecFile with content + content_hash
 *   PUT /repos/:id/context/file         → atomic local edit, guarded by base_hash
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  let service: ProjectContextService | undefined;
  const svc = () => (service ??= new ProjectContextService(app.container));

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextDocList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return svc().list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: ContextFileQuery, response: { 200: SpecFile } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return svc().readFile(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/context/file',
    { bodyLimit: PUT_BODY_LIMIT, schema: { params: IdParams, body: ContextDocWrite, response: { 200: SpecFile } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const saved = await svc().writeFile(workspaceId, req.params.id, req.body);
      // Never the content (NFR-4).
      req.log.info({ repo_id: req.params.id, path: saved.path, size: saved.size }, 'project context doc saved');
      return saved;
    },
  );
}
