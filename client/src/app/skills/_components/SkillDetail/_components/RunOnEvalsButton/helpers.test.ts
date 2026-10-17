import { describe, expect, it } from "vitest";
import { disabledReason } from "./helpers";

describe("disabledReason", () => {
  it("returns the first matching reason: running, then no cases, then no host", () => {
    expect(disabledReason({ running: true, caseCount: 0, hasHost: false })).toBe("disabledRunning");
    expect(disabledReason({ running: false, caseCount: 0, hasHost: false })).toBe("disabledNoCases");
    expect(disabledReason({ running: false, caseCount: 2, hasHost: false })).toBe("disabledNoHost");
    expect(disabledReason({ running: false, caseCount: 2, hasHost: true })).toBeNull();
  });
});
