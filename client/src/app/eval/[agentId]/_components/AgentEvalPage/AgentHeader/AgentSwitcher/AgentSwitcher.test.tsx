import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { EvalDashboardRow } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { AgentSwitcher } from "./AgentSwitcher";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

const row = (agent_id: string, agent_name: string): EvalDashboardRow => ({
  agent_id,
  agent_name,
  cases_total: 3,
  latest: null,
  running: false,
  delta: { recall: null, precision: null, citation_accuracy: null },
  drop: false,
});

describe("AgentSwitcher", () => {
  it("is a named select with a description, options in name order and the current agent selected (AC-9)", async () => {
    mockFetch({ "GET /eval/dashboard": [row("b", "beta"), row("a", "<script>alert(1)</script>"), row("c", "Alpha")] });
    renderWithProviders(<AgentSwitcher currentId="c" currentName="Alpha" />);
    const select = (await screen.findByRole("combobox", { name: "Switch agent" })) as HTMLSelectElement;
    expect(select).toHaveAccessibleDescription("Opens the selected agent's eval page");
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toEqual(["<script>alert(1)</script>", "Alpha", "beta"]);
    expect(select.value).toBe("c");
    expect(document.querySelector("script")).toBeNull();
  });

  it("lists the current agent as the selected option when the dashboard does not have it", async () => {
    mockFetch({ "GET /eval/dashboard": [row("a", "Zed")] });
    renderWithProviders(<AgentSwitcher currentId="n" currentName="No cases yet" />);
    const select = (await screen.findByRole("combobox", { name: "Switch agent" })) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["No cases yet", "Zed"]);
    expect(select.selectedOptions[0]!.textContent).toBe("No cases yet");
  });

  it("navigates to the picked agent's page and sends no non-GET request (AC-10)", async () => {
    const calls = mockFetch({ "GET /eval/dashboard": [row("a", "Alpha"), row("b", "Beta")] });
    renderWithProviders(<AgentSwitcher currentId="a" currentName="Alpha" />);
    const select = await screen.findByRole("combobox", { name: "Switch agent" });
    fireEvent.change(select, { target: { value: "b" } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/eval/b");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("does not navigate when the current agent is picked again", async () => {
    mockFetch({ "GET /eval/dashboard": [row("a", "Alpha"), row("b", "Beta")] });
    renderWithProviders(<AgentSwitcher currentId="a" currentName="Alpha" />);
    const select = await screen.findByRole("combobox", { name: "Switch agent" });
    fireEvent.change(select, { target: { value: "a" } });
    expect(push).not.toHaveBeenCalled();
  });

  it("is not rendered while the dashboard loads or after it failed (EC-7)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "boom", message: "x" } }), { status: 500 })),
    );
    renderWithProviders(<AgentSwitcher currentId="a" currentName="Alpha" />);
    expect(screen.queryByRole("combobox")).toBeNull();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
