import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
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

  it("passes onOpenFile through so a review-focus click reaches the page (AC-16)", async () => {
    mockFetch({
      "GET /pulls/p1/brief": {
        brief: {
          summary: "S",
          risks: { risks: [] },
          review_focus: [
            { file: "src/pay.ts", line: 42, reason: "retry loop" },
            { file: "src/other.ts", line: null, reason: "wiring" },
          ],
          intent: null,
          blast: null,
          head_sha: "abc",
          generated_at: "2026-10-07T00:00:00Z",
          model: "m",
          cost_usd: null,
          missing_inputs: [],
          intent_stale: false,
          truncated_inputs: [],
        },
        stale: false,
      },
      "GET /pulls/p1/intent": { intent: null, stale: false },
    });
    const onOpenFile = vi.fn();
    renderWithProviders(
      <OverviewTab prBody={null} prId="p1" repoId="r1" repoFullName="acme/api" headSha="abc" onOpenFile={onOpenFile} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open src/pay.ts:42 in the diff" }));
    fireEvent.click(screen.getByRole("button", { name: "Open src/other.ts in the diff" }));
    expect(onOpenFile.mock.calls).toEqual([
      ["src/pay.ts", 42],
      ["src/other.ts", null],
    ]);
  });
});
