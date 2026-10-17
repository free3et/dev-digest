import { describe, it, expect } from "vitest";
import { parseSkillTab, presetHostId } from "./helpers";
import { SKILL_TABS } from "./constants";

describe("parseSkillTab", () => {
  it("accepts every SKILL_TABS key, evals included", () => {
    for (const key of SKILL_TABS) expect(parseSkillTab(key)).toBe(key);
    expect(parseSkillTab("evals")).toBe("evals");
    expect(SKILL_TABS.indexOf("evals")).toBe(SKILL_TABS.indexOf("context") + 1);
  });
  it("falls back to config for unknown or missing values", () => {
    expect(parseSkillTab("nope")).toBe("config");
    expect(parseSkillTab(null)).toBe("config");
    expect(parseSkillTab(undefined)).toBe("config");
  });
});

describe("presetHostId (Spec G2 AC-5)", () => {
  const agents = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("prefers the newest suite's agent when it still exists", () => {
    expect(presetHostId({ suites: [{ agent_id: "b" }, { agent_id: "a" }], statsAgents: [{ id: "c" }], agents })).toBe("b");
  });
  it("falls back to the first linked agent that exists when the suite's agent is gone", () => {
    expect(presetHostId({ suites: [{ agent_id: "gone" }], statsAgents: [{ id: "gone2" }, { id: "c" }], agents })).toBe("c");
  });
  it("is null without suites and linked agents, on a stats error, and with no agents", () => {
    expect(presetHostId({ suites: [], statsAgents: [], agents })).toBeNull();
    expect(presetHostId({ suites: [], statsAgents: undefined, agents })).toBeNull();
    expect(presetHostId({ suites: [{ agent_id: "a" }], statsAgents: [{ id: "a" }], agents: [] })).toBeNull();
    expect(presetHostId({ suites: [{ agent_id: "a" }], statsAgents: [{ id: "a" }], agents: undefined })).toBeNull();
  });
});
