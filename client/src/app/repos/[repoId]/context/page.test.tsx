import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb: { label: string }[]; children: React.ReactNode }) => (
    <div>
      <nav aria-label="breadcrumb">{crumb.map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api", default_branch: "main" } }),
  useRepoNotFound: () => false,
}));
vi.mock("./_components/ContextView", () => ({ ContextView: () => <div>view</div> }));

import ContextPage from "./page";

afterEach(cleanup);

describe("ContextPage", () => {
  it("shows the breadcrumb <owner>/<name> > Project Context", () => {
    renderWithProviders(<ContextPage />);
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("acme/api > Project Context");
  });
});
