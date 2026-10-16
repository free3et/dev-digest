import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { TrendRow } from "../helpers";
import { TrendTooltip } from "./TrendTooltip";

afterEach(cleanup);

const row: TrendRow = {
  idx: 1,
  id: "r",
  version: 7,
  label: "v7",
  ran_at: "2026-10-12T09:30:00.000Z",
  recall: 82,
  precision: 78,
  citation: null,
};

describe("TrendTooltip", () => {
  it("shows version, local time and the three metrics, a dash for null (AC-19)", () => {
    const { container } = renderWithProviders(<TrendTooltip active payload={[{ payload: row }]} />);
    const lines = Array.from(container.querySelector("div > div")!.children).map((c) => c.textContent);
    expect(lines).toEqual(["v7 · 2026-10-12 09:30", "Recall 82%", "Precision 78%", "Citation —"]);
  });

  it("renders nothing when inactive or without a payload", () => {
    renderWithProviders(<TrendTooltip active={false} payload={[{ payload: row }]} />);
    expect(screen.queryByText(/Recall/)).toBeNull();
    cleanup();
    renderWithProviders(<TrendTooltip active payload={[]} />);
    expect(screen.queryByText(/Recall/)).toBeNull();
  });
});
