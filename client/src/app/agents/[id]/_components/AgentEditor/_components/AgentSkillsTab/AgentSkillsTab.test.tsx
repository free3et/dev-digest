import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { mockFetch, renderWithProviders, userEvent } from "@/test/render";
import { AgentSkillsTab } from "./AgentSkillsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sk = (id: string, type: Skill["type"] = "custom"): Skill => ({
  id, name: id, description: "d", type, source: "manual", body: "x".repeat(40), enabled: true, version: 1,
});
const SKILLS = [sk("alpha", "rubric"), sk("beta", "security"), sk("gamma")];
const link = (id: string, order: number, enabled = true): AgentSkillLink => ({ agent_id: "ag1", skill_id: id, order, enabled });
const LINKS = [link("alpha", 0), link("beta", 1, false)];

function setup() {
  const calls = mockFetch({
    "GET /skills": SKILLS,
    "GET /agents/ag1/skills": LINKS,
    "PUT /agents/ag1/skills/beta": [link("alpha", 0), link("beta", 1, true)],
    "POST /agents/ag1/skills": ({ body }: { body: unknown }) => {
      const b = body as { skill_ids?: string[]; skill_id?: string };
      if (b.skill_id) return [...LINKS, link(b.skill_id, LINKS.length)];
      return (b.skill_ids ?? []).map((id, i) => link(id, i));
    },
    "DELETE /agents/ag1/skills/alpha": [link("beta", 0, false)],
  });
  renderWithProviders(<AgentSkillsTab agentId="ag1" />);
  return calls;
}

describe("AgentSkillsTab", () => {
  it("lists every system skill with type labels and enabled count", async () => {
    setup();
    expect(await screen.findByText("1 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText(/Toggle attaches/)).toBeInTheDocument();
    expect(screen.getByText("~10 tokens of skill text enabled")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
    expect(screen.queryByText("Add skill")).not.toBeInTheDocument();
  });

  it("toggling a linked-disabled skill PUTs enabled", async () => {
    const calls = setup();
    const box = await screen.findByLabelText("Enable beta for this agent");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: "/agents/ag1/skills/beta", body: { enabled: true } });
  });

  it("toggling an unlinked skill POSTs skill_id to attach", async () => {
    const calls = setup();
    fireEvent.click(await screen.findByLabelText("Enable gamma for this agent"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && (c.body as { skill_id?: string }).skill_id === "gamma")).toBe(true));
  });

  it("unchecking a linked skill DELETEs the link", async () => {
    const calls = setup();
    fireEvent.click(await screen.findByLabelText("Enable alpha for this agent"));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("Move down POSTs the new order among linked skills", async () => {
    const calls = setup();
    await userEvent.click(await screen.findByLabelText("Move alpha down"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && Array.isArray((c.body as { skill_ids?: string[] }).skill_ids))).toBe(true));
    expect(calls.find((c) => c.method === "POST" && Array.isArray((c.body as { skill_ids?: string[] }).skill_ids))!.body).toEqual({
      skill_ids: ["beta", "alpha"],
    });
  });

  it("drag and drop reorders linked skills", async () => {
    const calls = setup();
    const alpha = (await screen.findByText("alpha")).closest("li")!;
    const beta = screen.getByText("beta").closest("li")!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(alpha, { dataTransfer });
    fireEvent.dragOver(beta, { dataTransfer });
    fireEvent.drop(beta, { dataTransfer });
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && Array.isArray((c.body as { skill_ids?: string[] }).skill_ids))).toBe(true),
    );
    expect(calls.find((c) => c.method === "POST" && Array.isArray((c.body as { skill_ids?: string[] }).skill_ids))!.body).toEqual({
      skill_ids: ["beta", "alpha"],
    });
  });

  it("filters all skills", async () => {
    setup();
    await userEvent.type(await screen.findByPlaceholderText("Filter skills…"), "gam");
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
  });
});
