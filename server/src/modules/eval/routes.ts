import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalCase,
  EvalCaseCopyRequest,
  EvalCaseManualCreate,
  EvalCaseDraft,
  EvalCaseOverrides,
  EvalDashboardRow,
  EvalDryRunRequest,
  EvalDryRunResult,
  EvalRecentRun,
  EvalRecentRunsQuery,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalSuiteStartRequest,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  EVAL_BODY_LIMIT_BYTES,
  EVAL_CASE_CREATE_RATE_LIMIT,
  EVAL_DRY_RUN_RATE_LIMIT,
  EVAL_MANUAL_BODY_LIMIT_BYTES,
  EVAL_RUN_RATE_LIMIT,
} from './constants.js';
import { EvalService } from './service.js';

const OkResponse = z.object({ ok: z.literal(true) });

/**
 * eval module.
 *   GET    /findings/:id/eval-case/draft   -> EvalCaseDraft (R-1 refusals; writes nothing)
 *   POST   /findings/:id/eval-case/dry-run -> EvalDryRunResult (R-1, R-3; 429, 413; writes nothing,
 *                                             a failed model call is 200 outcome:error)
 *   POST   /findings/:id/eval-case  -> 201 EvalCase; optional body EvalCaseOverrides
 *                                      (R-1 then R-3: 409 per spec A table R-1, 422
 *                                      validation_error / file_not_in_diff / kind_mismatch; 413)
 *   GET    /agents/:id/eval-cases   -> EvalCase[] sorted by name
 *   POST   /agents/:id/eval-cases   -> 201 EvalCase written by hand (body EvalCaseManualCreate; 422 invalid_diff /
 *                                      too_many_cases; 409 eval_run_in_progress; source is null)
 *   PATCH  /eval-cases/:id          -> EvalCase; body EvalCaseOverrides (name, expected_output); the file
 *                                      must stay the frozen diff's file (422 file_not_in_diff; 409 eval_run_in_progress)
 *   GET    /skills/:id/eval-cases   -> EvalCase[] of the skill, sorted by name (404)
 *   POST   /skills/:id/eval-cases   -> 201 EvalCase written by hand for a skill (body EvalCaseManualCreate; R-G1)
 *   POST   /skills/:id/eval-cases/copy -> 201 EvalCase copied from an agent case (body EvalCaseCopyRequest; R-G1)
 *   POST   /skills/:id/eval-runs    -> 202 EvalSuiteRun, a skill suite through a host agent (body
 *                                      EvalSuiteStartRequest; R-G3)
 *   GET    /skills/:id/eval-runs    -> EvalSuiteRun[] of the skill (<= 50, newest first; 404)
 *   POST   /eval-cases/:id/run      -> EvalDryRunResult (stateless single-case run, nothing stored; optional
 *                                      body EvalDryRunRequest: expected_output overrides the expectation for
 *                                      scoring; agent_id is the host of a skill case; R-G2)
 *   DELETE /eval-cases/:id          -> { ok: true } (409 eval_run_in_progress)
 *   POST   /agents/:id/eval-runs    -> 202 EvalSuiteRun (409 / 422 per spec A table R-2)
 *   GET    /eval-runs/:id           -> EvalSuiteRunDetail
 *   GET    /agents/:id/eval-runs    -> EvalSuiteRun[] (<= 50, newest first)
 *   GET    /eval/dashboard          -> EvalDashboardRow[]
 *   GET    /eval/recent-runs?limit= -> EvalRecentRun[] (finished, newest first, 1..50, default 10; 422)
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = EvalService.fromContainer(container);

  app.get(
    '/findings/:id/eval-case/draft',
    { schema: { params: IdParams, response: { 200: EvalCaseDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getCaseDraft(workspaceId, req.params.id);
    },
  );

  app.post(
    '/findings/:id/eval-case/dry-run',
    {
      schema: {
        params: IdParams,
        // nullish: Fastify hands an absent body to the validator as null
        // a finding dry-run has no host: `agent_id` here is a 422
        body: EvalDryRunRequest.omit({ agent_id: true }).nullish(),
        response: { 200: EvalDryRunResult },
      },
      bodyLimit: EVAL_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: EVAL_DRY_RUN_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.dryRunCase(workspaceId, req.params.id, req.body ?? undefined, req.log);
    },
  );

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        body: EvalCaseOverrides.nullish(),
        response: { 201: EvalCase },
      },
      bodyLimit: EVAL_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: EVAL_CASE_CREATE_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createCaseFromFinding(
        workspaceId,
        req.params.id,
        req.body ?? undefined,
      );
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCase) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    {
      schema: { params: IdParams, body: EvalCaseManualCreate, response: { 201: EvalCase } },
      bodyLimit: EVAL_MANUAL_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: EVAL_CASE_CREATE_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createManualCase(workspaceId, req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCase) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listSkillCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/skills/:id/eval-cases',
    {
      schema: { params: IdParams, body: EvalCaseManualCreate, response: { 201: EvalCase } },
      bodyLimit: EVAL_MANUAL_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: EVAL_CASE_CREATE_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createSkillManualCase(workspaceId, req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/skills/:id/eval-cases/copy',
    {
      schema: { params: IdParams, body: EvalCaseCopyRequest, response: { 201: EvalCase } },
      bodyLimit: EVAL_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: EVAL_CASE_CREATE_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.copyCaseToSkill(workspaceId, req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/skills/:id/eval-runs',
    {
      schema: { params: IdParams, body: EvalSuiteStartRequest, response: { 202: EvalSuiteRun } },
      bodyLimit: EVAL_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: EVAL_RUN_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const suite = await service.startSkillSuite(workspaceId, req.params.id, req.body.agent_id, req.log);
      return reply.code(202).send(suite);
    },
  );

  app.get(
    '/skills/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalSuiteRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listSkillSuites(workspaceId, req.params.id);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: OkResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      return { ok: true as const };
    },
  );

  app.patch(
    '/eval-cases/:id',
    {
      schema: { params: IdParams, body: EvalCaseOverrides, response: { 200: EvalCase } },
      bodyLimit: EVAL_BODY_LIMIT_BYTES,
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/eval-cases/:id/run',
    {
      schema: {
        params: IdParams,
        // nullish: Fastify hands an absent body to the validator as null
        body: EvalDryRunRequest.nullish(),
        response: { 200: EvalDryRunResult },
      },
      bodyLimit: EVAL_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: EVAL_DRY_RUN_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.runSingleCase(workspaceId, req.params.id, req.body ?? undefined, req.log);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalSuiteRun } },
      config: { rateLimit: { max: EVAL_RUN_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const suite = await service.startSuite(workspaceId, req.params.id, req.log);
      return reply.code(202).send(suite);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSuiteRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSuite(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalSuiteRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listSuites(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: z.array(EvalDashboardRow) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.dashboard(workspaceId);
    },
  );

  app.get(
    '/eval/recent-runs',
    { schema: { querystring: EvalRecentRunsQuery, response: { 200: z.array(EvalRecentRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.recentRuns(workspaceId, req.query.limit);
    },
  );
}
