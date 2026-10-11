import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentContextDocs, SkillContextDocs } from "@devdigest/shared";
import { mockFetch } from "@/test/render";
import {
  useAgentContextDocs,
  useSetAgentContextDocs,
  useSetSkillContextDocs,
  useSkillContextDocs,
} from "./context-docs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REPO = "11111111-1111-4111-8111-111111111111";
const AGENT: AgentContextDocs = { repo_id: REPO, own: [], inherited: [] };
const SKILL: SkillContextDocs = { repo_id: REPO, docs: [], used_by_agents: 2 };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("context-docs hooks", () => {
  it("GETs agent and skill docs with repo_id", async () => {
    const calls = mockFetch({
      [`GET /agents/a1/context-docs?repo_id=${REPO}`]: AGENT,
      [`GET /skills/s1/context-docs?repo_id=${REPO}`]: SKILL,
    });
    const { wrapper } = setup();
    const a = renderHook(() => useAgentContextDocs("a1", REPO), { wrapper });
    const s = renderHook(() => useSkillContextDocs("s1", REPO), { wrapper });
    await waitFor(() => expect(a.result.current.data).toEqual(AGENT));
    await waitFor(() => expect(s.result.current.data).toEqual(SKILL));
    expect(calls).toHaveLength(2);
  });

  it("stays idle without a repoId", () => {
    const calls = mockFetch({});
    const { wrapper } = setup();
    renderHook(() => useAgentContextDocs("a1", null), { wrapper });
    renderHook(() => useSkillContextDocs("s1", null), { wrapper });
    expect(calls).toHaveLength(0);
  });

  it("agent PUT sends { repo_id, paths } and invalidates context queries", async () => {
    const calls = mockFetch({ "PUT /agents/a1/context-docs": AGENT });
    const { qc, wrapper } = setup();
    qc.setQueryData(["context", REPO], {});
    qc.setQueryData(["context-file", REPO, "docs/a.md"], {});
    const { result } = renderHook(() => useSetAgentContextDocs("a1", REPO), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["docs/b.md", "docs/a.md"]);
    });
    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/agents/a1/context-docs",
      body: { repo_id: REPO, paths: ["docs/b.md", "docs/a.md"] },
    });
    expect(qc.getQueryState(["context", REPO])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["context-file", REPO, "docs/a.md"])?.isInvalidated).toBe(true);
  });

  it("skill PUT also invalidates agent context-docs queries", async () => {
    const calls = mockFetch({ "PUT /skills/s1/context-docs": SKILL });
    const { qc, wrapper } = setup();
    qc.setQueryData(["context", REPO], {});
    qc.setQueryData(["agent-context-docs", "a1", REPO], AGENT);
    const { result } = renderHook(() => useSetSkillContextDocs("s1", REPO), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["docs/a.md"]);
    });
    expect(calls[0]).toMatchObject({ method: "PUT", body: { repo_id: REPO, paths: ["docs/a.md"] } });
    expect(qc.getQueryState(["context", REPO])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["agent-context-docs", "a1", REPO])?.isInvalidated).toBe(true);
  });
});
