import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { PrBrief, PrIntent } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { IntentCard } from "./IntentCard";
import { PrBriefCard } from "../PrBriefCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const INTENT: PrIntent = {
  intent: "Add retries",
  in_scope: ["client"],
  out_of_scope: [],
  pr_id: "p1",
  head_sha: "abc",
  confidence: 0.9,
  confidence_level: "high",
  primary_source: "description",
  sources_used: [],
  risk_areas: [{ kind: "behavior", title: "Retry storm", file: "src/pay.ts", line: 3, explanation: "x" }],
  provider: "openai",
  model: "m",
  cost_usd: null,
  generated_at: "2026-10-07T00:00:00Z",
};

const BRIEF: PrBrief = {
  summary: "S",
  risks: { risks: [{ kind: "behavior", title: "Double charge", explanation: "e", severity: "high", file_refs: ["src/pay.ts"] }] },
  review_focus: [],
  intent: null,
  blast: null,
  head_sha: "abc",
  generated_at: "2026-10-07T00:00:00Z",
  model: "m",
  cost_usd: null,
  missing_inputs: [],
  intent_stale: false,
  truncated_inputs: [],
};

describe("IntentCard risk heading (AC-21)", () => {
  it("reads 'Intent risk areas' and coexists with the brief's 'Merge risks'", async () => {
    mockFetch({
      "GET /pulls/p1/intent": { intent: INTENT, stale: false },
      "GET /pulls/p1/brief": { brief: BRIEF, stale: false },
    });
    renderWithProviders(
      <>
        <IntentCard prId="p1" />
        <PrBriefCard prId="p1" />
      </>,
    );
    expect(await screen.findByRole("heading", { name: "Intent risk areas" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Merge risks" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Risk areas" })).not.toBeInTheDocument();
  });
});
