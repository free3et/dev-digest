import { describe, it, expect } from "vitest";
import { isCurrentVersion } from "./helpers";

describe("isCurrentVersion", () => {
  it("matches the live version number", () => {
    expect(isCurrentVersion(5, 5)).toBe(true);
    expect(isCurrentVersion(4, 5)).toBe(false);
  });
});
