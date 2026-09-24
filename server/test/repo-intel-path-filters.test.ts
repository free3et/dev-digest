import { describe, expect, it } from 'vitest';
import { isConventionTestPath, isJunkPath } from '../src/modules/repo-intel/helpers.js';

describe('repo-intel path filters', () => {
  it('isJunkPath still drops tests (onboarding / getConventionSamples)', () => {
    expect(isJunkPath('client/src/Foo.test.tsx')).toBe(true);
    expect(isJunkPath('server/src/a.spec.ts')).toBe(true);
    expect(isJunkPath('src/__tests__/a.ts')).toBe(true);
    expect(isJunkPath('src/errors.ts')).toBe(false);
  });

  it('isJunkPath still drops configs and migrations', () => {
    expect(isJunkPath('eslint.config.js')).toBe(true);
    expect(isJunkPath('src/db/migrations/0012.sql')).toBe(true);
    expect(isJunkPath('types.d.ts')).toBe(true);
  });

  it('isConventionTestPath keeps tests that isJunkPath would drop', () => {
    expect(isConventionTestPath('client/src/Foo.test.tsx')).toBe(true);
    expect(isConventionTestPath('src/__tests__/a.ts')).toBe(true);
    expect(isConventionTestPath('e2e/specs/foo.flow.json')).toBe(false);
    expect(isConventionTestPath('src/errors.ts')).toBe(false);
  });

  it('isConventionTestPath still rejects configs even if the name looks like a test', () => {
    expect(isConventionTestPath('eslint.test.js')).toBe(false);
    expect(isConventionTestPath('vitest.config.ts')).toBe(false);
  });
});
