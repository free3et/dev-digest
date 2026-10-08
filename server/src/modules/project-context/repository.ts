import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface ContextRepo {
  id: string;
  clonePath: string | null;
}

export interface InheritedDocLink {
  skillId: string;
  skillName: string;
  path: string;
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped lookup: a repo of another workspace is `undefined`. */
  async getRepoForWorkspace(workspaceId: string, repoId: string): Promise<ContextRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }

  /**
   * path -> number of distinct agents of the workspace whose next run on `repoId`
   * would include the path: attached directly, or through a skill linked with
   * `skills.enabled` AND `agent_skills.enabled`. `agents.enabled` is ignored.
   */
  async usedByAgentsByPath(workspaceId: string, repoId: string): Promise<Map<string, number>> {
    const rows = await this.db.execute<{ path: string; n: number }>(sql`
      select path, count(distinct agent_id)::int as n from (
        select acd.agent_id, acd.path
        from ${t.agentContextDocs} acd
        join ${t.agents} a on a.id = acd.agent_id
        where a.workspace_id = ${workspaceId} and acd.repo_id = ${repoId}
        union all
        select ags.agent_id, scd.path
        from ${t.skillContextDocs} scd
        join ${t.skills} s on s.id = scd.skill_id
        join ${t.agentSkills} ags on ags.skill_id = s.id
        join ${t.agents} a on a.id = ags.agent_id
        where a.workspace_id = ${workspaceId} and scd.repo_id = ${repoId}
          and s.enabled = true and ags.enabled = true
      ) u
      group by path
    `);
    return new Map(Array.from(rows, (r) => [r.path, Number(r.n)] as const));
  }

  /** Workspace-scoped lookup: an agent of another workspace is `undefined`. */
  async getAgentForWorkspace(workspaceId: string, agentId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)));
    return row;
  }

  /** Workspace-scoped lookup: a skill of another workspace is `undefined`. */
  async getSkillForWorkspace(workspaceId: string, skillId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)));
    return row;
  }

  /** Paths attached directly to the agent for the repo, in attach order. */
  async agentDocs(agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.order), asc(t.agentContextDocs.path));
    return rows.map((r) => r.path);
  }

  /** Paths attached to the skill for the repo, in attach order. */
  async skillDocs(skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.order), asc(t.skillContextDocs.path));
    return rows.map((r) => r.path);
  }

  /**
   * Documents the agent inherits through skills linked with `skills.enabled` AND
   * `agent_skills.enabled`, ordered by `agent_skills.order` then doc order.
   */
  async inheritedDocs(agentId: string, repoId: string): Promise<InheritedDocLink[]> {
    return this.db
      .select({ skillId: t.skills.id, skillName: t.skills.name, path: t.skillContextDocs.path })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(
        t.skillContextDocs,
        and(eq(t.skillContextDocs.skillId, t.skills.id), eq(t.skillContextDocs.repoId, repoId)),
      )
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.enabled, true), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order), asc(t.skills.id), asc(t.skillContextDocs.order), asc(t.skillContextDocs.path));
  }

  /** Replace the agent's set for one repo (order = index). One transaction. */
  async replaceAgentDocs(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(paths.map((path, i) => ({ agentId, repoId, path, order: i })));
    });
  }

  /** Replace the skill's set for one repo (order = index). One transaction. */
  async replaceSkillDocs(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, i) => ({ skillId, repoId, path, order: i })));
    });
  }

  /**
   * Agents of the skill's workspace linked to the skill with both switches on
   * (`skills.enabled` AND `agent_skills.enabled`); `agents.enabled` is ignored.
   */
  async skillUsedByAgents(skillId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(distinct ${t.agentSkills.agentId})::int` })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(and(eq(t.skills.id, skillId), eq(t.skills.enabled, true), eq(t.agentSkills.enabled, true)));
    return Number(row?.n ?? 0);
  }
}
