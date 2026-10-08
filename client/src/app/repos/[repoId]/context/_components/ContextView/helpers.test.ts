import { describe, expect, it } from "vitest";
import { footerTotals, relativeAge, splitPath } from "./helpers";

describe("footerTotals", () => {
  it("counts documents and sums approx_tokens", () => {
    expect(footerTotals([{ approx_tokens: 10 }, { approx_tokens: 5 }, { approx_tokens: 0 }])).toEqual({ count: 3, tokens: 15 });
  });
  it("is zero for an empty list", () => {
    expect(footerTotals([])).toEqual({ count: 0, tokens: 0 });
  });
});

describe("splitPath", () => {
  it("splits name and folder", () => {
    expect(splitPath("docs/specs/a.md")).toEqual({ name: "a.md", folder: "docs/specs" });
  });
  it("handles a root-level file", () => {
    expect(splitPath("a.md")).toEqual({ name: "a.md", folder: "" });
  });
});

describe("relativeAge", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  it.each([
    ["2026-10-05T11:59:30Z", "now", 0],
    ["2026-10-05T11:55:00Z", "minutes", 5],
    ["2026-10-05T09:00:00Z", "hours", 3],
    ["2026-10-02T12:00:00Z", "days", 3],
    ["2026-10-06T12:00:00Z", "now", 0],
    ["garbage", "now", 0],
  ])("%s -> %s", (iso, unit, count) => {
    expect(relativeAge(iso, now)).toEqual({ unit, count });
  });
});
