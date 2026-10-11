import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief } from "@devdigest/shared";
import { mockFetch } from "@/test/render";
import { useGeneratePrBrief, usePrBrief } from "./brief";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BRIEF: PrBrief = {
  summary: "Adds retries.",
  risks: { risks: [] },
  review_focus: [],
  intent: null,
  blast: null,
  head_sha: "abc",
  generated_at: "2026-10-07T00:00:00Z",
  model: "m",
  cost_usd: null,
  missing_inputs: [],
  intent_stale: false,
  truncated_inputs: [],
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("brief hooks", () => {
  it("GETs the brief and stores it under ['pr-brief', prId]", async () => {
    mockFetch({ "GET /pulls/p1/brief": { brief: BRIEF, stale: false } });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => usePrBrief("p1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ brief: BRIEF, stale: false }));
    expect(qc.getQueryData(["pr-brief", "p1"])).toEqual({ brief: BRIEF, stale: false });
  });

  it("stays idle without a prId", () => {
    const calls = mockFetch({});
    const { wrapper } = setup();
    renderHook(() => usePrBrief(null), { wrapper });
    expect(calls).toHaveLength(0);
  });

  it("generate success sets { brief, stale: false } without refetching", async () => {
    const calls = mockFetch({ "POST /pulls/p1/brief": BRIEF });
    const { qc, wrapper } = setup();
    qc.setQueryData(["pr-brief", "p1"], { brief: null, stale: false });
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(qc.getQueryData(["pr-brief", "p1"])).toEqual({ brief: BRIEF, stale: false });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /pulls/p1/brief"]);
  });

  it("a 409 leaves the cached brief untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "brief_unavailable", message: "no" } }), { status: 409 }),
      ),
    );
    const { qc, wrapper } = setup();
    const earlier = { brief: BRIEF, stale: true };
    qc.setQueryData(["pr-brief", "p1"], earlier);
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(["pr-brief", "p1"])).toEqual(earlier);
  });
});
