import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StructuredRequest } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ConfigError } from '../src/platform/errors.js';
import { guardProvider, runCase, type RunnableCase } from '../src/modules/eval/case-runner.js';
import { EVAL_MAX_OUTPUT_TOKENS } from '../src/modules/eval/constants.js';
import { buildSingleFileDiff } from '../src/modules/eval/helpers.js';

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const evalCase = (kind: 'must_find' | 'must_not_flag' = 'must_find'): RunnableCase => ({
  input_diff: buildSingleFileDiff('src/config.ts', PATCH),
  input_meta: { pr_number: 7, pr_title: 'Add Stripe client', pr_body: 'Body of the PR', repo: 'acme/app' },
  expected_output: { kind, file: 'src/config.ts', start_line: 11, end_line: 11 } as RunnableCase['expected_output'],
});

const finding = (start: number, end = start) => ({
  id: 'f1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hard-coded key',
  file: 'src/config.ts',
  start_line: start,
  end_line: end,
  rationale: 'because',
  confidence: 0.9,
});
const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 50, findings });

afterEach(() => {
  vi.useRealTimers();
});

describe('runCase: single shot request', () => {
  it('sends maxRetries 0, timeoutMs 120000 and the token cap; exactly one call', async () => {
    const llm = new MockLLMProvider('openrouter', { structured: review([finding(11)]) });
    const out = await runCase({ systemPrompt: 'sys', model: 'm', skills: [], llm, evalCase: evalCase() });
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const req = llm.calls[0]!.req as StructuredRequest<unknown>;
    expect(req.maxRetries).toBe(0);
    expect(req.timeoutMs).toBe(120_000);
    expect(req.maxTokens).toBe(EVAL_MAX_OUTPUT_TOKENS);
    expect(out.result.outcome).toBe('passed');
    expect(out.costUsd).toBe(0.001);
  });

  it('prompt carries the diff, title and body and none of the excluded sections', async () => {
    const llm = new MockLLMProvider('openrouter', { structured: review([]) });
    await runCase({
      systemPrompt: 'sys',
      model: 'm',
      skills: ['### Skill A\nbody'],
      llm,
      evalCase: evalCase(),
    });
    const req = llm.calls[0]!.req as StructuredRequest<unknown>;
    const text = req.messages.map((m) => m.content).join('\n');
    expect(text).toContain('stripeKey: "sk_live_xxx"');
    expect(text).toContain('Add Stripe client');
    expect(text).toContain('Body of the PR');
    expect(text).toContain('### Skill A');
    for (const heading of [
      '## Repo skeleton',
      '## Callers of changed symbols',
      '## Project context',
      '## Stated intent',
      '## Relevant memory',
    ]) {
      expect(text).not.toContain(heading);
    }
  });

  it('omits the PR description when the PR had no body', async () => {
    const llm = new MockLLMProvider('openrouter', { structured: review([]) });
    const c = evalCase();
    c.input_meta = { ...c.input_meta, pr_body: null };
    await runCase({ systemPrompt: 'sys', model: 'm', skills: [], llm, evalCase: c });
    const text = (llm.calls[0]!.req as StructuredRequest<unknown>).messages.map((m) => m.content).join('\n');
    expect(text).not.toContain('## PR description');
  });
});

describe('runCase: errors become an error outcome', () => {
  it('a never-settling call errors after 120 s and the late result is ignored', async () => {
    vi.useFakeTimers();
    let release: (v: unknown) => void = () => {};
    const llm = new MockLLMProvider('openrouter', {
      structuredFn: () => new Promise((r) => (release = r)),
    });
    const p = runCase({ systemPrompt: 's', model: 'm', skills: [], llm, evalCase: evalCase() });
    await vi.advanceTimersByTimeAsync(119_999);
    let done = false;
    void p.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await p;
    expect(out.result.outcome).toBe('error');
    expect(out.result.output.error).toBe('timed out after 120 s (the call may still be billed)');
    expect(out.result.pass).toBeNull();
    expect(out.costUsd).toBeNull();
    // the billed call finishes late: nothing changes, nothing throws
    release(review([finding(11)]));
    await vi.advanceTimersByTimeAsync(10);
    expect(out.result.outcome).toBe('error');
  });

  it('a schema failure names the possible truncation', async () => {
    const llm = new MockLLMProvider('openrouter', { structured: { nope: true } });
    const out = await runCase({ systemPrompt: 's', model: 'm', skills: [], llm, evalCase: evalCase() });
    expect(out.result.outcome).toBe('error');
    expect(out.result.output.error).toBe(
      'model output failed schema validation (possibly truncated at max_tokens=8192)',
    );
  });

  it('a ConfigError message is kept, and key-like tokens are stripped', async () => {
    const llm = new MockLLMProvider('openrouter', {
      structuredFn: () => {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      },
    });
    const out = await runCase({ systemPrompt: 's', model: 'm', skills: [], llm, evalCase: evalCase() });
    expect(out.result.output.error).toBe('OPENROUTER_API_KEY is not configured');

    const leaky = new MockLLMProvider('openrouter', {
      structuredFn: () => {
        throw new Error('401 for key sk-or-v1-0123456789abcdef0123456789abcdef');
      },
    });
    const out2 = await runCase({ systemPrompt: 's', model: 'm', skills: [], llm: leaky, evalCase: evalCase() });
    expect(out2.result.output.error).not.toContain('sk-or-v1');
  });
});

describe('guardProvider', () => {
  it('overrides a caller-supplied maxRetries / maxTokens / timeoutMs', async () => {
    const llm = new MockLLMProvider('openrouter', { structured: review([]) });
    const guarded = guardProvider(llm, 1234);
    const schema = { safeParse: (v: unknown) => ({ success: true, data: v }) };
    await guarded.completeStructured({
      model: 'm',
      schema: schema as never,
      schemaName: 'Review',
      messages: [],
      maxRetries: 5,
      maxTokens: 9,
      timeoutMs: 1,
    });
    const req = llm.calls[0]!.req as StructuredRequest<unknown>;
    expect(req).toMatchObject({ maxRetries: 0, maxTokens: EVAL_MAX_OUTPUT_TOKENS, timeoutMs: 1234 });
  });
});
