import { describe, expect, it } from "vitest";
import { switcherOptions } from "./helpers";

const row = (agent_id: string, agent_name: string) => ({ agent_id, agent_name });

describe("switcherOptions", () => {
  it("orders by name case-insensitively with the id as tiebreak", () => {
    const out = switcherOptions(
      [row("3", "beta"), row("2", "Alpha"), row("5", "alpha"), row("1", "Zed")],
      { id: "2", name: "Alpha" },
    );
    expect(out.map((o) => `${o.id}:${o.name}`)).toEqual(["2:Alpha", "5:alpha", "3:beta", "1:Zed"]);
  });

  it("adds the current agent when it is absent, in name order", () => {
    const out = switcherOptions([row("1", "Zed"), row("2", "Alpha")], { id: "9", name: "Mid" });
    expect(out.map((o) => o.id)).toEqual(["2", "9", "1"]);
  });

  it("does not duplicate the current agent and does not mutate the input", () => {
    const rows = [row("1", "Zed")];
    expect(switcherOptions(rows, { id: "1", name: "Zed" })).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });
});
