import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { EvalCase } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { evalFixtures, type EvalFixtures } from './helpers/eval-fixtures.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { buildSingleFileDiff } from '../src/modules/eval/helpers.js';

/**
 * Spec G1 (skill evals, server): skill-owned cases. AC-1 .. AC-5, the A2
 * regression and the case-side of NFR-3. Every app overrides all three LLM
 * providers (a missing override would be a real paid call); nothing here calls
 * a model.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', ...extra } as NodeJS.ProcessEnv);

const expectation = {
  kind: 'must_find' as const,
  file: 'src/config.ts',
  start_line: 11,
  end_line: 11,
  title: 'Hard-coded key',
  severity: 'CRITICAL',
  category: 'security',
};
const manualBody = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  patch: PATCH,
  expected_output: expectation,
  ...over,
});

d('skill eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let fx: EvalFixtures;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    fx = await evalFixtures(pg);
    workspaceId = fx.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(extra: Record<string, string> = {}) {
    return buildApp({
      config: config(extra),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({}),
        github: new MockGitHubClient(),
        llm: {
          openai: new MockLLMProvider('openai'),
          anthropic: new MockLLMProvider('anthropic'),
          openrouter: new MockLLMProvider('openrouter'),
        },
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  const errCode = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;

  async function addCase(
    owner: { kind: 'agent' | 'skill'; id: string },
    name: string,
    ws = workspaceId,
  ) {
    const file = 'src/config.ts';
    const [row] = await pg.handle.db
      .insert(t.evalCases)
      .values({
        workspaceId: ws,
        ownerKind: owner.kind,
        ownerId: owner.id,
        name,
        inputDiff: buildSingleFileDiff(file, PATCH),
        inputFiles: [file],
        inputMeta: { pr_number: 7, pr_title: `Title ${name}`, pr_body: 'Body', repo: 'acme/app' },
        expectedOutput: {
          ...expectation,
          source: {
            finding_id: randomUUID(),
            review_id: randomUUID(),
            pr_id: randomUUID(),
            repo: 'acme/app',
            head_sha: 'sha',
            agent_id: owner.kind === 'agent' ? owner.id : randomUUID(),
            run_id: null,
          },
        },
        notes: 'some note',
      })
      .returning();
    return row!;
  }

  async function runningSuite(owner: { kind: 'agent' | 'skill'; id: string }, hostAgentId?: string) {
    const [row] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        ownerKind: owner.kind,
        agentId: owner.kind === 'agent' ? owner.id : hostAgentId!,
        agentVersion: 1,
        skillId: owner.kind === 'skill' ? owner.id : null,
        skillVersion: owner.kind === 'skill' ? 1 : null,
        status: 'running',
      })
      .returning();
    return row!;
  }
  const finishSuite = (id: string) =>
    pg.handle.db.update(t.evalSuiteRuns).set({ status: 'failed' }).where(eq(t.evalSuiteRuns.id, id));

  const countCases = async (owner: { kind: 'agent' | 'skill'; id: string }) =>
    (
      await pg.handle.db
        .select({ n: sql<number>`count(*)::int` })
        .from(t.evalCases)
        .where(and(eq(t.evalCases.ownerKind, owner.kind), eq(t.evalCases.ownerId, owner.id)))
    )[0]!.n;

  // ------------------------------------------------------------------ AC-1

  it('lists only the skill cases, sorted by name; the agent list is unchanged (AC-1)', async () => {
    const skill = await fx.makeSkill();
    const agent = await fx.makeAgent();
    await addCase({ kind: 'skill', id: skill.id }, 'zeta case');
    await addCase({ kind: 'skill', id: skill.id }, 'alpha case');
    for (const n of ['c', 'a', 'b']) await addCase({ kind: 'agent', id: agent }, `agent ${n}`);
    const app = await appWith();

    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` });
    expect(res.statusCode).toBe(200);
    const list = (res.json() as unknown[]).map((c) => EvalCase.parse(c));
    expect(list.map((c) => c.name)).toEqual(['alpha case', 'zeta case']);
    expect(list.every((c) => c.owner_kind === 'skill' && c.owner_id === skill.id)).toBe(true);

    const agentList = await app.inject({ method: 'GET', url: `/agents/${agent}/eval-cases` });
    expect((agentList.json() as { name: string }[]).map((c) => c.name)).toEqual(['agent a', 'agent b', 'agent c']);

    const foreignSkill = await fx.makeSkill({ ws: fx.foreignWorkspaceId });
    for (const id of [foreignSkill.id, randomUUID()]) {
      expect((await app.inject({ method: 'GET', url: `/skills/${id}/eval-cases` })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid/eval-cases' })).statusCode).toBe(422);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-2

  it('writes a case by hand for a skill: 201, owner skill, source null, headers on the diff (AC-2)', async () => {
    const skill = await fx.makeSkill();
    const app = await appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/eval-cases`,
      payload: manualBody('hand written'),
    });
    expect(res.statusCode).toBe(201);
    const body = EvalCase.parse(res.json());
    expect(body).toMatchObject({
      owner_kind: 'skill',
      owner_id: skill.id,
      name: 'hand written',
      input_files: ['src/config.ts'],
      input_meta: { pr_number: 0, pr_title: 'hand written', pr_body: null, repo: 'manual' },
    });
    expect(body.expected_output.source).toBeNull();
    expect(body.input_diff).toContain('diff --git a/src/config.ts b/src/config.ts');
    expect(body.input_diff).toContain('--- a/src/config.ts');
    expect(body.input_diff).toContain('+++ b/src/config.ts');

    const [row] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, body.id));
    expect(row).toMatchObject({ ownerKind: 'skill', ownerId: skill.id, inputDiff: body.input_diff });
    expect((row!.expectedOutput as { source: unknown }).source).toBeNull();
    await app.close();
  });

  // ------------------------------------------------------------------ AC-3

  it('copies an agent case into a skill: six fields equal, source untouched, twice = two rows (AC-3)', async () => {
    const skill = await fx.makeSkill();
    const agent = await fx.makeAgent();
    const source = await addCase({ kind: 'agent', id: agent }, 'to copy');
    const app = await appWith();

    const copy = async () =>
      app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases/copy`, payload: { case_id: source.id } });
    const res = await copy();
    expect(res.statusCode).toBe(201);
    const body = EvalCase.parse(res.json());
    expect(body.id).not.toBe(source.id);
    expect(body).toMatchObject({ owner_kind: 'skill', owner_id: skill.id });
    expect(body.name).toBe(source.name);
    expect(body.input_diff).toBe(source.inputDiff);
    expect(body.input_files).toEqual(source.inputFiles);
    expect(body.input_meta).toEqual(source.inputMeta);
    expect(body.expected_output).toEqual(source.expectedOutput);
    expect(body.notes).toBe(source.notes);

    // the source row and the agent's list are unchanged
    const [after] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, source.id));
    expect(after).toEqual(source);
    expect(await countCases({ kind: 'agent', id: agent })).toBe(1);

    expect((await copy()).statusCode).toBe(201);
    expect(await countCases({ kind: 'skill', id: skill.id })).toBe(2);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-4

  it('refuses each R-G1 row with its status and code and stores no case (AC-4)', async () => {
    const app = await appWith();
    const post = (skillId: string, path: 'eval-cases' | 'eval-cases/copy', payload: unknown) =>
      app.inject({ method: 'POST', url: `/skills/${skillId}/${path}`, payload: payload as object });
    const agent = await fx.makeAgent();
    const agentCase = await addCase({ kind: 'agent', id: agent }, 'agent case');

    // unknown / foreign skill
    const foreignSkill = await fx.makeSkill({ ws: fx.foreignWorkspaceId });
    for (const id of [foreignSkill.id, randomUUID()]) {
      const r = await post(id, 'eval-cases', manualBody('x'));
      expect(r.statusCode).toBe(404);
      expect(errCode(r)).toBe('not_found');
      expect((await post(id, 'eval-cases/copy', { case_id: agentCase.id })).statusCode).toBe(404);
    }
    expect(await countCases({ kind: 'skill', id: foreignSkill.id })).toBe(0);

    const skill = await fx.makeSkill();
    const skillOwner = { kind: 'skill' as const, id: skill.id };

    // copy: unknown / foreign source
    const foreignAgent = await fx.makeAgent({ ws: fx.foreignWorkspaceId });
    const foreignCase = await addCase({ kind: 'agent', id: foreignAgent }, 'foreign', fx.foreignWorkspaceId);
    for (const case_id of [foreignCase.id, randomUUID()]) {
      const r = await post(skill.id, 'eval-cases/copy', { case_id });
      expect(r.statusCode).toBe(404);
      expect(errCode(r)).toBe('not_found');
    }

    // copy: source is a skill case
    const otherSkillCase = await addCase(skillOwner, 'a skill case');
    const notAgent = await post(skill.id, 'eval-cases/copy', { case_id: otherSkillCase.id });
    expect(notAgent.statusCode).toBe(422);
    expect(errCode(notAgent)).toBe('not_agent_case');
    expect(await countCases(skillOwner)).toBe(1);

    // manual: patch without a hunk for the file
    const noHunk = await post(skill.id, 'eval-cases', manualBody('x', { patch: 'just text, no hunk' }));
    expect(noHunk.statusCode).toBe(422);
    expect(errCode(noHunk)).toBe('invalid_diff');
    expect(await countCases(skillOwner)).toBe(1);

    // a running skill suite
    const running = await runningSuite(skillOwner, agent);
    for (const r of [
      await post(skill.id, 'eval-cases', manualBody('x')),
      await post(skill.id, 'eval-cases/copy', { case_id: agentCase.id }),
    ]) {
      expect(r.statusCode).toBe(409);
      expect(errCode(r)).toBe('eval_run_in_progress');
    }
    expect(await countCases(skillOwner)).toBe(1);
    await finishSuite(running.id);

    // 100 cases
    const full = await fx.makeSkill();
    await pg.handle.db.insert(t.evalCases).values(
      Array.from({ length: 100 }, (_, i) => ({
        workspaceId,
        ownerKind: 'skill' as const,
        ownerId: full.id,
        name: `bulk ${i}`,
        inputDiff: buildSingleFileDiff('src/config.ts', PATCH),
        inputFiles: ['src/config.ts'],
        inputMeta: { pr_number: 0, pr_title: 'x', pr_body: null, repo: 'manual' },
        expectedOutput: { ...expectation, source: null },
      })),
    );
    for (const r of [
      await post(full.id, 'eval-cases', manualBody('one more')),
      await post(full.id, 'eval-cases/copy', { case_id: agentCase.id }),
    ]) {
      expect(r.statusCode).toBe(422);
      expect(errCode(r)).toBe('too_many_cases');
    }
    expect(await countCases({ kind: 'skill', id: full.id })).toBe(100);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-5

  it('guards PATCH / DELETE by the case OWNER, not by the host (AC-5)', async () => {
    const app = await appWith();
    const patch = (id: string) =>
      app.inject({ method: 'PATCH', url: `/eval-cases/${id}`, payload: { name: `renamed ${++seq}` } });
    const del = (id: string) => app.inject({ method: 'DELETE', url: `/eval-cases/${id}` });

    const skill = await fx.makeSkill();
    const host = await fx.makeAgent();
    const skillOwner = { kind: 'skill' as const, id: skill.id };
    const skillCase = await addCase(skillOwner, 'skill case');

    // running skill suite -> 409 for PATCH and DELETE of a skill case
    const skillRun = await runningSuite(skillOwner, host);
    for (const r of [await patch(skillCase.id), await del(skillCase.id)]) {
      expect(r.statusCode).toBe(409);
      expect(errCode(r)).toBe('eval_run_in_progress');
    }
    await finishSuite(skillRun.id);

    // a running suite of the HOST agent leaves skill-case PATCH / DELETE alone
    const hostRun = await runningSuite({ kind: 'agent', id: host });
    expect((await patch(skillCase.id)).statusCode).toBe(200);
    const spare = await addCase(skillOwner, 'spare');
    expect((await del(spare.id)).statusCode).toBe(200);
    // ... while the agent's own case is still blocked by it
    const agentCase = await addCase({ kind: 'agent', id: host }, 'host agent case');
    for (const r of [await patch(agentCase.id), await del(agentCase.id)]) {
      expect(r.statusCode).toBe(409);
    }
    await finishSuite(hostRun.id);

    // a skill suite hosted by the agent does not block the agent's case
    const hosted = await runningSuite(skillOwner, host);
    expect((await patch(agentCase.id)).statusCode).toBe(200);
    expect((await del(agentCase.id)).statusCode).toBe(200);
    await finishSuite(hosted.id);
    await app.close();
  });

  // ------------------------------------------------------------------ A2 + NFR-3

  it('the finding dry-run does not accept agent_id (A2 regression)', async () => {
    const agent = await fx.makeAgent();
    const f = await fx.makeFinding({ agentId: agent, decided: 'accepted' });
    const app = await appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/findings/${f.findingId}/eval-case/dry-run`,
      payload: { agent_id: agent },
    });
    expect(res.statusCode).toBe(422);
    expect(errCode(res)).toBe('validation_error');
    await app.close();
  });

  it('rejects unknown keys and malformed ids; manual bodies over 256 KB answer 413 (NFR-3)', async () => {
    const skill = await fx.makeSkill();
    const agent = await fx.makeAgent();
    const source = await addCase({ kind: 'agent', id: agent }, 'src');
    const app = await appWith();
    const copyUrl = `/skills/${skill.id}/eval-cases/copy`;
    expect((await app.inject({ method: 'POST', url: copyUrl, payload: { case_id: source.id, x: 1 } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: copyUrl, payload: { case_id: 'nope' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: copyUrl, payload: {} })).statusCode).toBe(422);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/skills/${skill.id}/eval-cases`,
          payload: { ...manualBody('x'), extra: true },
        })
      ).statusCode,
    ).toBe(422);
    const huge = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/eval-cases`,
      payload: manualBody('big', { patch: `@@ -1,1 +1,1 @@\n${'a'.repeat(270_000)}` }),
    });
    expect(huge.statusCode).toBe(413);
    await app.close();
  });

  it('the 31st skill case write in a minute answers 429 (NFR-3)', async () => {
    // The limiter is inert under nodeEnv "test" (server INSIGHTS 2026-10-07).
    const skill = await fx.makeSkill();
    const agent = await fx.makeAgent();
    const source = await addCase({ kind: 'agent', id: agent }, 'rl src');
    const app: App = await appWith({ NODE_ENV: 'development' });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const r = await app.inject({
        method: 'POST',
        url: `/skills/${skill.id}/eval-cases/copy`,
        payload: { case_id: source.id },
      });
      statuses.push(r.statusCode);
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
    await app.close();
  });
});
