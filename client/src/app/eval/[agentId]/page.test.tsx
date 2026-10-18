import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { mockFetch, renderWithProviders } from "@/test/render";

const ID = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";
let segment = ID;

vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: segment }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb: { label: string; href?: string }[]; children: React.ReactNode }) => (
    <div>
      <ol aria-label="breadcrumb">
        {crumb.map((c) => (
          <li key={c.label}>{c.href ? <a href={c.href}>{c.label}</a> : c.label}</li>
        ))}
      </ol>
      {children}
    </div>
  ),
}));

import AgentEvalRoute from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  segment = ID;
});

const AGENT = { id: ID, name: "Security Reviewer", provider: "openrouter", model: "gpt-x" };

function routes(extra: Record<string, unknown> = {}) {
  return {
    [`GET /agents/${ID}`]: AGENT,
    [`GET /agents/${ID}/eval-runs`]: [],
    [`GET /agents/${ID}/eval-cases`]: [{ id: "c1" }],
    "GET /eval/dashboard": [],
    ...extra,
  };
}

describe("/eval/[agentId] page", () => {
  it("reads Skills Lab > Eval Dashboard > <agent name>, with the middle crumb linking to /eval (AC-5)", async () => {
    mockFetch(routes());
    renderWithProviders(<AgentEvalRoute />);
    const crumbs = screen.getByRole("list", { name: "breadcrumb" });
    expect(crumbs).toHaveTextContent("Skills LabEval DashboardAgent");
    expect(await screen.findByText("Security Reviewer", { selector: "li" })).toBeInTheDocument();
    expect(crumbs).toHaveTextContent("Skills LabEval DashboardSecurity Reviewer");
    expect(screen.getByRole("link", { name: "Eval Dashboard" })).toHaveAttribute("href", "/eval");
  });

  it("keeps the placeholder crumb in the not-found state (404)", async () => {
    mockFetch({ ...routes(), [`GET /agents/${ID}`]: undefined });
    renderWithProviders(<AgentEvalRoute />);
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "breadcrumb" })).toHaveTextContent("Skills LabEval DashboardAgent");
  });

  it("shows not-found for a non-UUID segment and sends no request containing it (AC-2, NFR-3)", async () => {
    segment = "not-a-uuid";
    const calls = mockFetch(routes());
    renderWithProviders(<AgentEvalRoute />);
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
    expect(screen.getByText("This agent does not exist or was deleted.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All agents" })).toHaveAttribute("href", "/eval");
    expect(screen.getByRole("list", { name: "breadcrumb" })).toHaveTextContent("Skills LabEval DashboardAgent");
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(0);
  });

  it("sends no request for a path-traversal segment", async () => {
    segment = "../../x";
    const calls = mockFetch(routes());
    renderWithProviders(<AgentEvalRoute />);
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path.includes("x"))).toHaveLength(0));
    expect(calls).toHaveLength(0);
  });
});
