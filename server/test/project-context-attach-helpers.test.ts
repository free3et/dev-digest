import { describe, it, expect } from 'vitest';
import {
  assertAttachable,
  dedupeInherited,
  toAttachment,
  type DocListMap,
} from '../src/modules/project-context/helpers.js';

const docs = (entries: Record<string, number>): DocListMap =>
  new Map(Object.entries(entries).map(([p, size]) => [p, { size, approx_tokens: Math.ceil(size / 4) }]));

describe('toAttachment', () => {
  it('262144 bytes is not too_large and carries tokens', () => {
    expect(toAttachment('docs/a.md', docs({ 'docs/a.md': 262144 }))).toEqual({
      path: 'docs/a.md',
      doc_type: 'docs',
      approx_tokens: 65536,
      missing: false,
      too_large: false,
    });
  });

  it('262145 bytes is too_large with null tokens', () => {
    const a = toAttachment('docs/a.md', docs({ 'docs/a.md': 262145 }));
    expect(a.too_large).toBe(true);
    expect(a.missing).toBe(false);
    expect(a.approx_tokens).toBeNull();
  });

  it('missing beats too_large; an empty list makes everything missing', () => {
    const a = toAttachment('docs/gone.md', docs({}));
    expect(a).toMatchObject({ missing: true, too_large: false, approx_tokens: null });
  });
});

describe('dedupeInherited', () => {
  it('drops own paths and later duplicates, keeping first-occurrence order', () => {
    const list = docs({ 'docs/a.md': 4, 'docs/b.md': 8, 'specs/c.md': 12 });
    const out = dedupeInherited(
      ['docs/a.md'],
      [
        { skillId: 's1', skillName: 'one', path: 'docs/a.md' },
        { skillId: 's1', skillName: 'one', path: 'docs/b.md' },
        { skillId: 's2', skillName: 'two', path: 'specs/c.md' },
        { skillId: 's2', skillName: 'two', path: 'docs/b.md' },
      ],
      list,
    );
    expect(out.map((o) => [o.path, o.skill_id])).toEqual([
      ['docs/b.md', 's1'],
      ['specs/c.md', 's2'],
    ]);
  });
});

describe('assertAttachable', () => {
  it('accepts listed or already attached paths, rejects unknown with 422', () => {
    const list = docs({ 'docs/a.md': 1 });
    expect(() => assertAttachable(['docs/a.md', 'docs/old.md'], list, ['docs/old.md'])).not.toThrow();
    expect(() => assertAttachable(['docs/zzz.md'], list, [])).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });
});
