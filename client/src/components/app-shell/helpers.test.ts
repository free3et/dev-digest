import { describe, expect, it } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("marks the Eval Dashboard active on /eval and any /eval path", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/x")).toBe("eval");
    expect(activeKeyFor("/eval/3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c")).toBe("eval");
  });

  it("keeps the agent Evals tab under Agents", () => {
    expect(activeKeyFor("/agents/a1")).toBe("agents");
  });
});
