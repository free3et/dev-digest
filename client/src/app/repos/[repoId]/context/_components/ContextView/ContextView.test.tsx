import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ContextDocList, SpecFile } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { ContextView } from "./ContextView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const doc = (path: string, doc_type: SpecFile["doc_type"], approx_tokens: number): SpecFile => ({
  path,
  content: null,
  size: approx_tokens * 4,
  updated_at: null,
  doc_type,
  approx_tokens,
  content_hash: null,
  used_by_agents: 0,
});

const LIST: ContextDocList = {
  documents: [
    doc("docs/arch/overview.md", "docs", 1200),
    doc("docs/specs/auth.md", "specs", 300),
    doc(".devdigest/insights/notes.md", "insights", 50),
  ],
  refreshed_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  cloned: true,
};

describe("ContextView list", () => {
  it("renders rows in received order with name, folder, type badge, tokens and a full-path title", async () => {
    mockFetch({ "GET /repos/r1/context": LIST });
    renderWithProviders(<ContextView repoId="r1" />);
    const rows = await screen.findAllByRole("button", { name: /\.md/ });
    expect(rows.map((r) => r.getAttribute("title"))).toEqual(LIST.documents.map((d) => d.path));
    const first = rows[0]!;
    expect(within(first).getByText("overview.md")).toBeInTheDocument();
    expect(within(first).getByText("docs/arch")).toBeInTheDocument();
    expect(within(first).getByText("docs")).toBeInTheDocument();
    expect(within(first).getByText("≈ 1200 tok")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("specs")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("insights")).toBeInTheDocument();
  });

  it("shows the footer: count, summed tokens and relative refresh time", async () => {
    mockFetch({ "GET /repos/r1/context": LIST });
    renderWithProviders(<ContextView repoId="r1" />);
    expect(await screen.findByText("3 documents · ≈ 1 550 tokens total · refreshed 5m ago")).toBeInTheDocument();
  });

  it("Refresh re-requests the list and replaces rows and footer", async () => {
    let n = 0;
    const second: ContextDocList = {
      documents: [doc("specs/new.md", "specs", 40)],
      refreshed_at: new Date().toISOString(),
      cloned: true,
    };
    const calls = mockFetch({ "GET /repos/r1/context": () => (n++ === 0 ? LIST : second) });
    renderWithProviders(<ContextView repoId="r1" />);
    await screen.findByText(/3 documents/);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("1 document · ≈ 40 tokens total · refreshed just now")).toBeInTheDocument();
    expect(screen.getByText("new.md")).toBeInTheDocument();
    expect(screen.queryByText("overview.md")).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/repos/r1/context")).toHaveLength(2);
  });

  it("shows the not-cloned state instead of the list", async () => {
    mockFetch({ "GET /repos/r1/context": { documents: [], refreshed_at: LIST.refreshed_at, cloned: false } });
    renderWithProviders(<ContextView repoId="r1" />);
    expect(await screen.findByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the empty state naming the search roots", async () => {
    mockFetch({ "GET /repos/r1/context": { documents: [], refreshed_at: LIST.refreshed_at, cloned: true } });
    renderWithProviders(<ContextView repoId="r1" />);
    expect(await screen.findByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText(/specs, docs, insights/)).toBeInTheDocument();
  });

  it("shows an inline error and Retry refetches the list", async () => {
    let n = 0;
    const fn = vi.fn(async () =>
      n++ === 0
        ? new Response(JSON.stringify({ error: { code: "internal", message: "boom" } }), { status: 500 })
        : new Response(JSON.stringify(LIST), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fn);
    renderWithProviders(<ContextView repoId="r1" />);
    expect(await screen.findByText("Couldn’t load documents")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("overview.md")).toBeInTheDocument());
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("selecting a row opens its document in the panel", async () => {
    mockFetch({
      "GET /repos/r1/context": LIST,
      [`GET /repos/r1/context/file?path=${encodeURIComponent("docs/specs/auth.md")}`]: {
        ...doc("docs/specs/auth.md", "specs", 300),
        content: "# Auth spec",
        content_hash: "h",
      },
    });
    renderWithProviders(<ContextView repoId="r1" />);
    fireEvent.click(await screen.findByRole("button", { name: /auth\.md/ }));
    expect(await screen.findByRole("heading", { name: "Auth spec" })).toBeInTheDocument();
  });

  it("a row that stops being selected gets its transparent border back (no stale outline)", async () => {
    mockFetch({ "GET /repos/r1/context": LIST });
    renderWithProviders(<ContextView repoId="r1" />);
    const first = await screen.findByRole("button", { name: /overview\.md/ });
    const second = screen.getByRole("button", { name: /auth\.md/ });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-current", "true");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
    // Clearing a `borderColor` longhand would leave `currentColor` (white) behind.
    expect(first.style.borderColor).toBe("transparent");
  });
});
