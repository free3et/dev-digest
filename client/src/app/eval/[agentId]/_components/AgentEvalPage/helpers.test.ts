import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { isUuid, pageState } from "./helpers";

describe("isUuid", () => {
  it("accepts v4, upper case and nil UUIDs", () => {
    expect(isUuid("3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c")).toBe(true);
    expect(isUuid("3F2B8C1E-5A4D-4E7B-9C1A-0D2E4F6A8B1C")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const v of [
      "not-a-uuid",
      "../../x",
      "",
      "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c-extra",
      "x3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c",
      "3f2b8c1e5a4d4e7b9c1a0d2e4f6a8b1c",
      "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1g",
      "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c\n",
    ]) {
      expect(isUuid(v)).toBe(false);
    }
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("pageState", () => {
  const none = { data: undefined, error: null };
  const nf = { data: undefined, error: new ApiError("nope", 404, "not_found") };
  const boom = { data: undefined, error: new ApiError("boom", 500) };
  const data = { data: { id: "a" }, error: null };
  const id = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";

  it("is invalid without a valid id, whatever the queries say", () => {
    expect(pageState({ validId: null, agent: data, runs: none })).toBe("invalid");
  });

  it("is loading until the agent arrives", () => {
    expect(pageState({ validId: id, agent: none, runs: none })).toBe("loading");
    expect(pageState({ validId: id, agent: none, runs: data })).toBe("loading");
  });

  it("is notFound on a 404 from the agent or the runs, even over cached data", () => {
    expect(pageState({ validId: id, agent: nf, runs: none })).toBe("notFound");
    expect(pageState({ validId: id, agent: data, runs: nf })).toBe("notFound");
    expect(pageState({ validId: id, agent: { data: { id: "a" }, error: nf.error }, runs: data })).toBe("notFound");
  });

  it("is error for a non-404 agent failure, and a network failure", () => {
    expect(pageState({ validId: id, agent: boom, runs: none })).toBe("error");
    expect(pageState({ validId: id, agent: { data: undefined, error: new TypeError("fetch failed") }, runs: none })).toBe("error");
  });

  it("is ready when the agent has data, even if the runs failed with a non-404", () => {
    expect(pageState({ validId: id, agent: data, runs: none })).toBe("ready");
    expect(pageState({ validId: id, agent: data, runs: boom })).toBe("ready");
  });
});
