import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Review } from '@devdigest/shared';
import {
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
} from '../src/adapters/mocks.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});

describe('MockLLMProvider scripted mode (structuredFn)', () => {
  const Answer = z.object({ answer: z.string() });
  const req = (system: string) => ({
    model: 'm',
    schema: Answer,
    schemaName: 'Answer',
    messages: [{ role: 'system' as const, content: system }],
  });

  it('answers per request, validates the result and records the call', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredFn: (r) => ({
        answer: (r.messages as { content: string }[])[0]!.content === 'v1' ? 'old' : 'new',
      }),
    });
    expect((await llm.completeStructured(req('v1'))).data.answer).toBe('old');
    expect((await llm.completeStructured(req('v2'))).data.answer).toBe('new');
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);
  });

  it('supports an async function and takes precedence over structured fixtures', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: { answer: 'fixture' },
      structuredBySchema: { Answer: { answer: 'by-schema' } },
      structuredFn: async () => ({ answer: 'scripted' }),
    });
    expect((await llm.completeStructured(req('x'))).data.answer).toBe('scripted');
  });

  it('a throw rejects the call and is still recorded', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredFn: () => {
        throw new Error('provider exploded');
      },
    });
    await expect(llm.completeStructured(req('x'))).rejects.toThrow('provider exploded');
    expect(llm.calls).toHaveLength(1);
  });

  it('a never-resolving function hangs the call', async () => {
    const llm = new MockLLMProvider('openai', { structuredFn: () => new Promise(() => {}) });
    const outcome = await Promise.race([
      llm.completeStructured(req('x')).then(() => 'settled'),
      new Promise((r) => setTimeout(() => r('hung'), 30)),
    ]);
    expect(outcome).toBe('hung');
  });

  it('a result that fails the schema still throws the fixture error', async () => {
    const llm = new MockLLMProvider('openai', { structuredFn: () => ({ nope: 1 }) });
    await expect(llm.completeStructured(req('x'))).rejects.toThrow('fixture failed schema');
  });

  it('accepts the openrouter id and reports it as the model provider', async () => {
    const llm = new MockLLMProvider('openrouter');
    expect(llm.id).toBe('openrouter');
    expect((await llm.listModels())[0]!.provider).toBe('openrouter');
  });

  it('default behaviour is unchanged without structuredFn', async () => {
    const llm = new MockLLMProvider('anthropic', { structured: { answer: 'plain' } });
    expect((await llm.completeStructured(req('x'))).data.answer).toBe('plain');
    expect((await llm.listModels())[0]!.provider).toBe('anthropic');
  });
});
