import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { mockFetch, renderWithProviders } from "@/test/render";
import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OverviewTab", () => {
  it("renders the PR Brief card before the Intent card", async () => {
    mockFetch({
      "GET /pulls/p1/brief": { brief: null, stale: false },
      "GET /pulls/p1/intent": { intent: null, stale: false },
    });
    renderWithProviders(
      <OverviewTab prBody={null} prId="p1" repoId="r1" repoFullName="acme/api" headSha="abc" />,
    );
    const brief = await screen.findByRole("button", { name: "Generate brief" });
    const intent = await screen.findByRole("button", { name: "Generate intent" });
    expect(brief.compareDocumentPosition(intent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
