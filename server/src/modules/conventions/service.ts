import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionUpdate,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  CONFIG_FILES,
  EXTRACTION_SCHEMA_NAME,
  MAX_PROPOSED,
  MAX_TOTAL_CHARS,
  SAMPLE_FILE_COUNT,
} from './constants.js';
import { groundAll } from './grounding.js';
import { buildSkillDraft, toConventionDto } from './helpers.js';
import { ConventionsRepository, type RepoInfo } from './repository.js';
import { ExtractionSchema, SYSTEM_PROMPT, renderFile } from './prompt.js';

/**
 * Conventions use cases: sample (code) → propose (one model call) → verify
 * (code) → replace pending rows. The model never browses and never has the last
 * word: a candidate whose snippet is not in the cited file is dropped.
 */
export class ConventionsService {
  private _repo?: ConventionsRepository;

  constructor(private container: Container) {}

  private get repo() {
    return (this._repo ??= new ConventionsRepository(this.container.db));
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoInfo> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    await this.requireRepo(workspaceId, repoId);
    return (await this.repo.list(workspaceId, repoId)).map(toConventionDto);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const ref = { owner: repo.owner, name: repo.name };
    const read = async (path: string): Promise<string | undefined> => {
      try {
        const text = await this.container.git.readFile(ref, path);
        return text === '' ? undefined : text;
      } catch {
        return undefined; // missing file: skipped silently
      }
    };

    // 1. Sample: CONFIG list + ranked source files, deduped, in that order.
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    const paths = [...new Set([...CONFIG_FILES, ...ranked])];
    const blocks: string[] = [];
    const sampled = new Set<string>();
    let total = 0;
    for (const path of paths) {
      const text = await read(path);
      if (text === undefined) continue;
      const block = renderFile(path, text);
      if (total + block.length > MAX_TOTAL_CHARS) break;
      total += block.length;
      blocks.push(block);
      sampled.add(path);
    }
    if (sampled.size === 0) throw new AppError('repo_not_readable', 'No files could be read from the clone', 409);

    // 2. Propose: one structured call on the model chosen in Settings.
    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ExtractionSchema,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: blocks.join('\n\n') },
      ],
      temperature: 0,
    });
    const proposed = res.data.candidates.slice(0, MAX_PROPOSED);

    // 3. Verify in code, then replace only the pending rows.
    const { kept, dropped } = await groundAll(proposed, sampled, read);
    const rows = await this.repo.replacePending(workspaceId, repoId, kept);
    return {
      candidates: rows.map(toConventionDto),
      proposed: proposed.length,
      dropped_ungrounded: dropped,
    };
  }

  async update(workspaceId: string, id: string, patch: ConventionUpdate): Promise<ConventionCandidate> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  /** Reject = DELETE the row (there is no "rejected" state). */
  async remove(workspaceId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(workspaceId, id))) throw new NotFoundError('Convention not found');
  }

  /** Build the skill draft from `accepted = true` rows only. Persists nothing. */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.list(workspaceId, repoId, true);
    if (rows.length === 0) throw new AppError('no_accepted_conventions', 'Accept at least one convention first', 409);
    return buildSkillDraft(rows);
  }
}
