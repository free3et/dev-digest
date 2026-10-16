import { describe, expect, it } from "vitest";
import type { EvalRecentRun } from "@devdigest/shared";
import { recallPointsByAgent } from "./helpers";

const item = (id: string, agent_id: string, recall: number | null, status: EvalRecentRun["status"] = "done") =>
  ({ id, agent_id, recall, status }) as EvalRecentRun;

describe("recallPointsByAgent", () => {
  it("groups per agent, oldest first, dropping null recall", () => {
    // newest first, interleaved agents
    const items = [
      item("5", "b", 0.9),
      item("4", "a", 0.82),
      item("3", "a", null),
      item("2", "b", 0.6),
      item("1", "a", 0.7),
    ];
    const map = recallPointsByAgent(items);
    expect(map.get("a")).toEqual([0.7, 0.82]);
    expect(map.get("b")).toEqual([0.6, 0.9]);
  });

  it("keeps an agent with only null recall as an empty series, and handles no items", () => {
    expect(recallPointsByAgent([item("1", "a", null)]).get("a")).toEqual([]);
    expect(recallPointsByAgent([]).size).toBe(0);
  });
});
