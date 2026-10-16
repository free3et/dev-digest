/**
 * formatCostUsd carries a product rule, not just a display choice: "—" means we
 * have no cost for a run, "$0.00" means the run genuinely was free (the price
 * book lists free models at 0). Conflating the two would tell a user a paid
 * review cost nothing, so both directions are pinned here.
 */
import { describe, it, expect } from "vitest";
import {
  formatCostUsd,
  formatTokenCount,
  toPercent,
  metricDelta,
  pointDelta,
  formatRanAt,
  formatRanAtLocal,
  MINUS,
  EMPTY,
} from "./format";

describe("formatCostUsd", () => {
  it("renders each cost band the way the design does", () => {
    // One rule (4dp, trim trailing zeros, 2dp floor) has to cover three orders
    // of magnitude — these are the exact values from the mockups.
    expect(formatCostUsd(0.0013)).toBe("$0.0013"); // flash model, small diff
    expect(formatCostUsd(0.014)).toBe("$0.014");
    expect(formatCostUsd(0.06)).toBe("$0.06"); // whole cents still read as money
    expect(formatCostUsd(0.003)).toBe("$0.003");
  });

  it("distinguishes 'no data' from 'free'", () => {
    expect(formatCostUsd(null)).toBe(EMPTY);
    expect(formatCostUsd(undefined)).toBe(EMPTY);
    expect(formatCostUsd(NaN)).toBe(EMPTY);
    expect(formatCostUsd(0)).toBe("$0.00");
  });

  it("never rounds a real cost down to a free-looking $0.0000", () => {
    expect(formatCostUsd(0.00002)).toBe("<$0.0001");
  });

  it("keeps dollars readable above $1", () => {
    expect(formatCostUsd(1.5)).toBe("$1.50");
    expect(formatCostUsd(12.3456)).toBe("$12.3456");
  });
});

describe("formatTokenCount", () => {
  it("separates thousands with spaces, not commas", () => {
    expect(formatTokenCount(9119)).toBe("9 119");
    expect(formatTokenCount(150)).toBe("150");
    expect(formatTokenCount(1234567)).toBe("1 234 567");
  });
});

describe("MINUS", () => {
  it("is the typographic minus U+2212, not an ASCII hyphen", () => {
    expect(MINUS.charCodeAt(0)).toBe(0x2212);
    expect(MINUS.length).toBe(1);
  });
});

describe("formatRanAt", () => {
  it("formats timestamps in UTC deterministically", () => {
    expect(formatRanAt("2026-10-12T09:30:45.000Z")).toBe("2026-10-12 09:30 UTC");
    expect(formatRanAt("not a date")).toBe("not a date");
  });
});

describe("test environment", () => {
  it("runs in UTC (vitest.config.ts pins TZ)", () => {
    expect(new Date(0).getTimezoneOffset()).toBe(0);
  });
});

describe("formatRanAtLocal", () => {
  it("formats in the given zone, zero-padded, 24-hour, no suffix", () => {
    expect(formatRanAtLocal("2026-10-15T20:38:00Z", "Europe/Kyiv")).toBe("2026-10-15 23:38");
    expect(formatRanAtLocal("2026-10-15T20:38:00Z", "UTC")).toBe("2026-10-15 20:38");
    expect(formatRanAtLocal("2026-10-15T20:38:00Z")).toBe("2026-10-15 20:38");
    expect(formatRanAtLocal("2026-05-29T00:05:00Z", "UTC")).toBe("2026-05-29 00:05");
  });
  it("returns unparsable input as is", () => {
    expect(formatRanAtLocal("not a date")).toBe("not a date");
  });
});

describe("toPercent / metricDelta / pointDelta", () => {
  it("rounds a metric to whole percent points, null stays null", () => {
    expect(toPercent(0.78)).toBe(78);
    expect(toPercent(0.784)).toBe(78);
    expect(toPercent(0.825)).toBe(83);
    expect(toPercent(0)).toBe(0);
    expect(toPercent(1)).toBe(100);
    expect(toPercent(null)).toBeNull();
  });

  it("computes B − A to 6 dp and returns null when either side is null", () => {
    expect(metricDelta(0.25, 0.5)).toBe(0.25);
    expect(metricDelta(0.6, 0.8)).toBe(0.2); // 0.8 − 0.6 is 0.20000000000000007 in floats
    expect(metricDelta(0.5, 0.5)).toBe(0);
    expect(Object.is(metricDelta(0.1, 0.1), 0)).toBe(true);
    expect(metricDelta(null, 0.5)).toBeNull();
    expect(metricDelta(0.5, null)).toBeNull();
  });

  it("turns a delta into direction and whole points", () => {
    expect(pointDelta(0.04)).toEqual({ direction: "up", points: 4, belowOne: false });
    expect(pointDelta(-0.1)).toEqual({ direction: "down", points: 10, belowOne: false });
    expect(pointDelta(0.003)).toEqual({ direction: "up", points: 0, belowOne: true });
    expect(pointDelta(-0.003)).toEqual({ direction: "down", points: 0, belowOne: true });
    expect(pointDelta(0)).toEqual({ direction: "flat", points: 0, belowOne: false });
    expect(pointDelta(null)).toBeNull();
  });

  it("reports the delta of the stored values, not of the rounded percents (EC-19)", () => {
    // 0.784 → 78% and 0.825 → 83%, but the delta 0.041 is 4 points, not 5
    expect(toPercent(0.825)! - toPercent(0.784)!).toBe(5);
    expect(pointDelta(metricDelta(0.784, 0.825))).toEqual({ direction: "up", points: 4, belowOne: false });
  });
});
