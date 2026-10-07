import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocList, SpecFile } from "@devdigest/shared";
import { mockFetch } from "@/test/render";
import { useContextFile, useContextFiles, useSaveContextFile } from "./core";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FILE: SpecFile = {
  path: "docs/a b.md",
  content: "# A",
  size: 3,
  updated_at: null,
  doc_type: "docs",
  approx_tokens: 1,
  content_hash: "h1",
  used_by_agents: 0,
};
const LIST: ContextDocList = { documents: [{ ...FILE, content: null }], refreshed_at: "2026-10-05T10:00:00Z", cloned: true };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("project context hooks", () => {
  it("useContextFiles returns the ContextDocList", async () => {
    mockFetch({ "GET /repos/r1/context": LIST });
    const { wrapper } = setup();
    const { result } = renderHook(() => useContextFiles("r1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(LIST));
  });

  it("useContextFile URL-encodes the path", async () => {
    const calls = mockFetch({ [`GET /repos/r1/context/file?path=${encodeURIComponent(FILE.path)}`]: FILE });
    const { wrapper } = setup();
    const { result } = renderHook(() => useContextFile("r1", FILE.path), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(FILE));
    expect(calls[0]?.path).toContain("path=docs%2Fa%20b.md");
  });

  it("useContextFile stays idle without a path", () => {
    const calls = mockFetch({});
    const { wrapper } = setup();
    renderHook(() => useContextFile("r1", null), { wrapper });
    expect(calls).toHaveLength(0);
  });

  it("useSaveContextFile PUTs, sets the file query and invalidates the list", async () => {
    const saved = { ...FILE, content: "# B", content_hash: "h2" };
    const calls = mockFetch({ "PUT /repos/r1/context/file": saved });
    const { qc, wrapper } = setup();
    qc.setQueryData(["context", "r1"], LIST);
    const { result } = renderHook(() => useSaveContextFile("r1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ path: FILE.path, content: "# B", base_hash: "h1" });
    });
    expect(calls[0]?.body).toEqual({ path: FILE.path, content: "# B", base_hash: "h1" });
    expect(qc.getQueryData(["context-file", "r1", FILE.path])).toEqual(saved);
    expect(qc.getQueryState(["context", "r1"])?.isInvalidated).toBe(true);
  });
});
