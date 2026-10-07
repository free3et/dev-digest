import { describe, expect, it } from "vitest";
import { TABS } from "./constants";
import { parseAgentTab } from "./helpers";

describe("parseAgentTab", () => {
  it("accepts every tab the editor renders, including context", () => {
    for (const tab of TABS) expect(parseAgentTab(tab.key)).toBe(tab.key);
    expect(parseAgentTab("context")).toBe("context");
  });

  it("falls back to config for a missing or unknown value", () => {
    expect(parseAgentTab(null)).toBe("config");
    expect(parseAgentTab(undefined)).toBe("config");
    expect(parseAgentTab("nope")).toBe("config");
  });
});
