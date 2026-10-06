import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { isConflict, isDirty } from "./helpers";

describe("isDirty", () => {
  it("is false for equal text and true for any difference", () => {
    expect(isDirty("a", "a")).toBe(false);
    expect(isDirty("a ", "a")).toBe(true);
    expect(isDirty("", "a")).toBe(true);
  });
});

describe("isConflict", () => {
  it("is true only for a 409 ApiError", () => {
    expect(isConflict(new ApiError("x", 409, "conflict"))).toBe(true);
    expect(isConflict(new ApiError("x", 500))).toBe(false);
    expect(isConflict(new Error("x"))).toBe(false);
    expect(isConflict(null)).toBe(false);
  });
});
