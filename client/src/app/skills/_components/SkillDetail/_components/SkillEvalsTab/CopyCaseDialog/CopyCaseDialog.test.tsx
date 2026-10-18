import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockFetch, renderWithProviders } from "@/test/render";
import { useSkillEvalCases } from "@/lib/hooks/eval";
import { CopyCaseDialog } from "./CopyCaseDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENTS = [
  { id: "a1", name: "Reviewer A", model: "gpt-x" },
  { id: "a2", name: "Reviewer B", model: "gpt-y" },
  { id: "a3", name: "No Cases", model: "gpt-z" },
];
const kase = (id: string, name: string) => ({ id, name });

/** Mounts the dialog next to a live skill-cases query, to observe the refetch. */
function Harness() {
  const cases = useSkillEvalCases("s1");
  return (
    <>
      <span data-testid="n">{cases.data?.length ?? 0}</span>
      <CopyCaseDialog skillId="s1" agents={AGENTS} />
    </>
  );
}

describe("CopyCaseDialog", () => {
  it("fetches nothing before open, groups cases by agent, copies by case_id and refetches the skill list", async () => {
    const calls = mockFetch({
      "GET /skills/s1/eval-cases": [],
      "GET /agents/a1/eval-cases": [kase("c1", "src/a.ts:1 first")],
      "GET /agents/a2/eval-cases": [kase("c2", "src/b.ts:2 second")],
      "GET /agents/a3/eval-cases": [],
      "POST /skills/s1/eval-cases/copy": { id: "new" },
    });
    renderWithProviders(<Harness />);
    await waitFor(() => expect(calls.some((c) => c.path === "/skills/s1/eval-cases")).toBe(true));
    expect(calls.some((c) => c.path.startsWith("/agents/"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Copy from agent case" }));
    const dialog = await screen.findByRole("dialog", { name: "Copy an agent's eval case" });
    const groupA = await within(dialog).findByRole("region", { name: "Reviewer A" });
    expect(within(groupA).getByRole("button", { name: "Copy eval case “src/a.ts:1 first”" })).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "Reviewer B" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("region", { name: "No Cases" })).toBeNull();

    fireEvent.click(within(groupA).getByRole("button", { name: /Copy eval case/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/skills/s1/eval-cases/copy", body: { case_id: "c1" } });
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET" && c.path === "/skills/s1/eval-cases")).toHaveLength(2),
    );
  });

  it("shows the refusal text and stays open on 422 not_agent_case", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ error: { code: "not_agent_case", message: "m" } }), { status: 422 });
        }
        return new Response(JSON.stringify(path === "/agents/a1/eval-cases" ? [kase("c1", "first")] : []), { status: 200 });
      }),
    );
    renderWithProviders(<CopyCaseDialog skillId="s1" agents={AGENTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy from agent case" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy eval case “first”" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Only an agent's case can be copied/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says so when no agent has cases, and closes with the Close button", async () => {
    mockFetch({ "GET /agents/a1/eval-cases": [], "GET /agents/a2/eval-cases": [], "GET /agents/a3/eval-cases": [] });
    renderWithProviders(<CopyCaseDialog skillId="s1" agents={AGENTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy from agent case" }));
    expect(await screen.findByText("No agent has eval cases yet.")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
