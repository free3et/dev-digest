import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { metricDelta, pointDelta } from "@/lib/format";
import { MetricPercent, PointDelta, RanAt } from "./EvalMetric";
import { EVAL_CAPTION_STYLE } from "./constants";
import { VISUALLY_HIDDEN } from "@/lib/visually-hidden";

describe("MetricPercent", () => {
  it("renders whole percents and the empty marker for null", () => {
    renderWithProviders(
      <div>
        <p data-testid="a">
          <MetricPercent value={0.78} />
        </p>
        <p data-testid="b">
          <MetricPercent value={null} />
        </p>
        <p data-testid="c">
          <MetricPercent value={0} />
        </p>
      </div>,
    );
    expect(screen.getByTestId("a")).toHaveTextContent(/^78%$/);
    expect(screen.getByTestId("b")).toHaveTextContent(/^—$/);
    expect(screen.getByTestId("c")).toHaveTextContent(/^0%$/);
  });
});

describe("PointDelta", () => {
  it("states the direction as text and in the accessible name, never as colour alone", () => {
    renderWithProviders(
      <div>
        <PointDelta delta={pointDelta(metricDelta(0.78, 0.82))} />
        <PointDelta delta={pointDelta(-0.1)} />
        <PointDelta delta={pointDelta(0.003)} />
        <PointDelta delta={pointDelta(-0.004)} />
        <PointDelta delta={pointDelta(0)} />
        <PointDelta delta={null} />
      </div>,
    );
    expect(screen.getByRole("img", { name: "up 4 pt" })).toHaveTextContent("▲ 4 pt");
    expect(screen.getByRole("img", { name: "down 10 pt" })).toHaveTextContent("▼ 10 pt");
    expect(screen.getByRole("img", { name: "up <1 pt" })).toHaveTextContent("▲ <1 pt");
    expect(screen.getByRole("img", { name: "down <1 pt" })).toHaveTextContent("▼ <1 pt");
    const flat = screen.getByRole("img", { name: "unchanged" });
    expect(flat).toHaveTextContent(/^0 pt$/);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(5);
  });
});

describe("RanAt", () => {
  it("shows local time with the exact UTC instant as tooltip, and passes junk through", () => {
    renderWithProviders(
      <div>
        <RanAt iso="2026-05-29T09:14:00Z" />
        <RanAt iso="not a date" />
      </div>,
    );
    const t = screen.getByTitle("2026-05-29 09:14 UTC");
    expect(t.tagName).toBe("TIME");
    expect(t).toHaveTextContent(/^2026-05-29 09:14$/);
    expect(t).toHaveAttribute("datetime", "2026-05-29T09:14:00Z");
    const bad = screen.getByText("not a date");
    expect(bad).not.toHaveAttribute("datetime");
    expect(bad).toHaveAttribute("title", "not a date");
  });
});

describe("shared styles", () => {
  it("caption is uppercase in a contrast-safe colour; hidden style clips", () => {
    expect(EVAL_CAPTION_STYLE.textTransform).toBe("uppercase");
    expect(EVAL_CAPTION_STYLE.color).toBe("var(--text-secondary)");
    expect(VISUALLY_HIDDEN.position).toBe("absolute");
    expect(VISUALLY_HIDDEN.clip).toBe("rect(0, 0, 0, 0)");
  });
});
