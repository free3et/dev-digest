import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { MetricSparkline } from "./MetricSparkline";

describe("MetricSparkline", () => {
  it("names the series with its range and hides the drawing from assistive tech", () => {
    const { container } = renderWithProviders(
      <MetricSparkline points={[0.7, 0.75, 0.82]} color="var(--accent)" metricLabel="Recall" />,
    );
    const img = screen.getByRole("img", { name: "Recall trend over 3 runs: from 70% to 82%" });
    const svg = container.querySelector("svg");
    expect(img).toContainElement(svg as SVGElement);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(img).not.toHaveAttribute("tabindex");
    expect(svg).not.toHaveAttribute("tabindex");
  });

  it("draws a line of at least 2 px in the given colour", () => {
    const { container } = renderWithProviders(
      <MetricSparkline points={[0.2, 0.9]} color="var(--ok)" metricLabel="Precision" />,
    );
    const line = container.querySelector("polyline") as SVGPolylineElement;
    expect(Number(line.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(2);
    expect(line).toHaveAttribute("stroke", "var(--ok)");
  });

  it("renders a metric label with markup literally", () => {
    renderWithProviders(
      <MetricSparkline points={[0.1, 0.2]} color="red" metricLabel="<script>alert(1)</script>" />,
    );
    expect(
      screen.getByRole("img", { name: "<script>alert(1)</script> trend over 2 runs: from 10% to 20%" }),
    ).toBeInTheDocument();
  });

  it("renders nothing below two points", () => {
    const { container } = renderWithProviders(
      <div>
        <MetricSparkline points={[0.5]} color="red" metricLabel="Recall" />
        <MetricSparkline points={[]} color="red" metricLabel="Recall" />
      </div>,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a flat series at mid-height", () => {
    const { container } = renderWithProviders(
      <MetricSparkline points={[0.6, 0.6, 0.6]} color="red" metricLabel="Recall" height={24} />,
    );
    const ys = (container.querySelector("polyline")?.getAttribute("points") ?? "")
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    expect(ys).toEqual([12, 12, 12]);
    expect(screen.getByRole("img", { name: "Recall trend over 3 runs: from 60% to 60%" })).toBeInTheDocument();
  });

  it("keeps the run count exact", () => {
    renderWithProviders(<MetricSparkline points={[0.1, 0.2, 0.3, 0.4]} color="red" metricLabel="Recall" />);
    expect(screen.getByRole("img", { name: /trend over 4 runs/ })).toBeInTheDocument();
  });
});
