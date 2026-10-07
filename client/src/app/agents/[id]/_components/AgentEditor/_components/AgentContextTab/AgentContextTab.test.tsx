import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { AgentContextDocs, ContextAttachment, ContextDocList, InheritedContextAttachment, SpecFile } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { AgentContextTab } from "./AgentContextTab";

const REPO = "11111111-1111-4111-8111-111111111111";
const active = vi.hoisted(() => ({ repoId: null as string | null }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: active.repoId }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const doc = (path: string, tokens: number, size = 100): SpecFile => ({
  path, doc_type: "specs", approx_tokens: tokens, size, used_by_agents: 0,
});
const att = (path: string, tokens: number | null, o: Partial<ContextAttachment> = {}): ContextAttachment => ({
  path, doc_type: "specs", approx_tokens: tokens, missing: false, too_large: false, ...o,
});
const inherited: InheritedContextAttachment = { ...att("docs/inh.md", 7), skill_id: "s1", skill_name: "arch" };

const LIST: ContextDocList = {
  cloned: true,
  refreshed_at: "2026-10-06T00:00:00Z",
  documents: [doc("specs/a.md", 10), doc("specs/b.md", 20), doc("specs/huge.md", 99, 300_000), doc("docs/inh.md", 7)],
};
const ATTACHED: AgentContextDocs = { repo_id: REPO, own: [att("specs/b.md", 20)], inherited: [inherited] };

const LIST_URL = `GET /repos/${REPO}/context`;
const GET_URL = `GET /agents/ag1/context-docs?repo_id=${REPO}`;

function renderTab(repoId: string | null = REPO) {
  active.repoId = repoId;
  return renderWithProviders(<AgentContextTab agentId="ag1" />);
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
}

describe("AgentContextTab", () => {
  it("orders own, inherited, rest; K excludes inherited; inherited row is read-only", async () => {
    mockFetch({ [LIST_URL]: LIST, [GET_URL]: ATTACHED });
    renderTab();
    expect(await screen.findByText("1 of 4 attached")).toBeInTheDocument();
    const order = screen.getAllByRole("checkbox").map((el) => el.getAttribute("aria-label"));
    expect(order).toEqual(["specs/b.md", "docs/inh.md", "specs/a.md", "specs/huge.md"]);
    expect(screen.getByRole("checkbox", { name: "docs/inh.md" })).toBeDisabled();
    expect(screen.getByText("via skill arch")).toBeInTheDocument();
    expect(screen.getByText("≈ 27 tokens · own 20 + via skills 7")).toBeInTheDocument();
    expect(screen.getByText("per review pass; large PRs repeat it per diff chunk")).toBeInTheDocument();
  });

  it("toggle sends the full ordered list and the total changes synchronously", async () => {
    const calls = mockFetch({
      [LIST_URL]: LIST,
      [GET_URL]: ATTACHED,
      "PUT /agents/ag1/context-docs": () => ({ repo_id: REPO, own: [att("specs/b.md", 20), att("specs/a.md", 10)], inherited: [inherited] }),
    });
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "specs/a.md" }));
    // Synchronously after the click, before the server answers.
    expect(screen.getByText("≈ 37 tokens · own 30 + via skills 7")).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      path: "/agents/ag1/context-docs",
      body: { repo_id: REPO, paths: ["specs/b.md", "specs/a.md"] },
    });
  });

  it("a too_large document adds 0 to the total and shows the skipped label", async () => {
    mockFetch({ [LIST_URL]: LIST, [GET_URL]: ATTACHED, "PUT /agents/ag1/context-docs": ATTACHED });
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "specs/huge.md" }));
    expect(screen.getByText("≈ 27 tokens · own 20 + via skills 7")).toBeInTheDocument();
    expect(screen.getByText("Skipped — over 256 KB")).toBeInTheDocument();
  });

  it("AC-9: a missing attachment counts 0 tokens and Detach saves the list without it", async () => {
    const gone = att("specs/gone.md", null, { missing: true });
    const calls = mockFetch({
      [LIST_URL]: LIST,
      [GET_URL]: { repo_id: REPO, own: [gone, att("specs/a.md", 10)], inherited: [] },
      "PUT /agents/ag1/context-docs": { repo_id: REPO, own: [att("specs/a.md", 10)], inherited: [] },
    });
    renderTab();
    expect(await screen.findByText("missing")).toBeInTheDocument();
    expect(screen.getByText("≈ 10 tokens · own 10 + via skills 0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Detach specs/gone.md" }));
    expect(screen.queryByText("missing")).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ repo_id: REPO, paths: ["specs/a.md"] });
  });

  it("AC-3: Move down reorders the rows at once and saves the full reordered list", async () => {
    const calls = mockFetch({
      [LIST_URL]: LIST,
      [GET_URL]: { repo_id: REPO, own: [att("specs/a.md", 10), att("specs/b.md", 20)], inherited: [] },
      "PUT /agents/ag1/context-docs": { repo_id: REPO, own: [att("specs/b.md", 20), att("specs/a.md", 10)], inherited: [] },
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Move specs/a.md down" }));
    const order = screen.getAllByRole("checkbox").map((el) => el.getAttribute("aria-label"));
    expect(order.slice(0, 2)).toEqual(["specs/b.md", "specs/a.md"]);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ repo_id: REPO, paths: ["specs/b.md", "specs/a.md"] });
  });

  it("shows an accessible spinner while loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderTab();
    expect(screen.getByRole("status", { name: "Loading documents…" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows an inline error and Retry re-requests the failed call", async () => {
    let failing = true;
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        urls.push(path);
        if (path === `/repos/${REPO}/context`) return json(LIST);
        if (failing) return new Response(JSON.stringify({ error: { code: "boom", message: "boom" } }), { status: 500 });
        return json(ATTACHED);
      }),
    );
    renderTab();
    const retry = await screen.findByRole("button", { name: "Retry" });
    const before = urls.filter((u) => u.includes("context-docs")).length;
    failing = false;
    fireEvent.click(retry);
    expect(await screen.findByText("1 of 4 attached")).toBeInTheDocument();
    expect(urls.filter((u) => u.includes("context-docs")).length).toBeGreaterThan(before);
  });

  it("without an active repo shows the prompt and sends no request", () => {
    const calls = mockFetch({});
    renderTab(null);
    expect(screen.getByText("Select a repository to attach its documents")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
