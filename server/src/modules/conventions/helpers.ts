import { SKILL_BODY_MAX } from '@devdigest/shared';
import type { ConventionCandidate, ConventionCategory, ConventionSkillDraft } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';
import { CONVENTIONS_SKILL_DESCRIPTION, CONVENTIONS_SKILL_NAME } from './constants.js';

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_line: row.evidenceLine,
    category: row.category,
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

const CATEGORY_ORDER: ConventionCategory[] = [
  'naming',
  'structure',
  'errors',
  'imports',
  'typing',
  'api',
  'testing',
  'general',
];

/** Build the `repo-conventions` draft from ACCEPTED rows only (caller filters). Fits SKILL_BODY_MAX. */
export function buildSkillDraft(rows: ConventionRow[]): ConventionSkillDraft {
  const lines: string[] = ['# Repository conventions', ''];
  const used: ConventionRow[] = [];
  for (const cat of CATEGORY_ORDER) {
    const group = rows.filter((r) => r.category === cat);
    if (group.length === 0) continue;
    const section: string[] = [`## ${cat}`];
    const added: ConventionRow[] = [];
    for (const r of group) {
      const ref = r.evidencePath ? ` (\`${r.evidencePath}${r.evidenceLine ? `:${r.evidenceLine}` : ''}\`)` : '';
      const bullet = `- ${r.rule}${ref}`;
      const next = [...lines, ...section, bullet].join('\n').length;
      if (next > SKILL_BODY_MAX) break;
      section.push(bullet);
      added.push(r);
    }
    if (added.length === 0) continue;
    lines.push(...section, '');
    used.push(...added);
  }
  return {
    name: CONVENTIONS_SKILL_NAME,
    description: CONVENTIONS_SKILL_DESCRIPTION,
    body: lines.join('\n').trim(),
    evidence_files: [...new Set(used.map((r) => r.evidencePath).filter((p): p is string => !!p))],
    convention_ids: used.map((r) => r.id),
  };
}
