import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ContextAttachment, ContextDocList, SkillContextDocs, SpecFile } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { SkillContextTab } from "./SkillContextTab";

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

const LIST: ContextDocList = {
  cloned: true,
  refreshed_at: "2026-10-06T00:00:00Z",
  documents: [doc("specs/a.md", 10), doc("specs/b.md", 20), doc("specs/huge.md", 99, 300_000)],
};
const ATTACHED: SkillContextDocs = { repo_id: REPO, docs: [att("specs/b.md", 20), att("specs/a.md", 10)], used_by_agents: 3 };

const LIST_URL = `GET /repos/${REPO}/context`;
const GET_URL = `GET /skills/sk1/context-docs?repo_id=${REPO}`;

function renderTab(repoId: string | null = REPO) {
  active.repoId = repoId;
  return renderWithProviders(<SkillContextTab skillId="sk1" />);
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
}

describe("SkillContextTab", () => {
  it("shows N attached, the used-by hint, the footer sum and the caption", async () => {
    mockFetch({ [LIST_URL]: LIST, [GET_URL]: ATTACHED });
    renderTab();
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents · used by 3 agents")).toBeInTheDocument();
    expect(screen.getByText("≈ 30 tokens")).toBeInTheDocument();
    expect(screen.getByText("per review pass; large PRs repeat it per diff chunk")).toBeInTheDocument();
    expect(screen.queryByText(/via skill/)).not.toBeInTheDocument();
  });

  it("uses the singular and zero forms of the hint", async () => {
    mockFetch({ [LIST_URL]: LIST, [GET_URL]: { ...ATTACHED, used_by_agents: 0 } });
    renderTab();
    expect(await screen.findByText(/used by 0 agents$/)).toBeInTheDocument();
  });

  it("renders the Serializes as block for two documents in order", async () => {
    mockFetch({ [LIST_URL]: LIST, [GET_URL]: ATTACHED });
    renderTab();
    const block = await screen.findByLabelText("Serializes as");
    expect(block.textContent).toBe("## Project context\n- specs/b.md\n- specs/a.md");
  });

  it("a too_large document adds 0 to the footer and shows the skipped label; sends the full list", async () => {
    const calls = mockFetch({ [LIST_URL]: LIST, [GET_URL]: ATTACHED, "PUT /skills/sk1/context-docs": ATTACHED });
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "specs/huge.md" }));
    expect(screen.getByText("≈ 30 tokens")).toBeInTheDocument();
    expect(screen.getByText("Skipped — over 256 KB")).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      path: "/skills/sk1/context-docs",
      body: { repo_id: REPO, paths: ["specs/b.md", "specs/a.md", "specs/huge.md"] },
    });
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
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(urls.filter((u) => u.includes("context-docs")).length).toBeGreaterThan(before);
  });

  it("without an active repo shows the prompt and sends no request", () => {
    const calls = mockFetch({});
    renderTab(null);
    expect(screen.getByText("Select a repository to attach its documents")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
