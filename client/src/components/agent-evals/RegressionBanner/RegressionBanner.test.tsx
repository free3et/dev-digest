import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { EvalSuiteRun } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { RegressionBanner } from "./RegressionBanner";

afterEach(cleanup);

function run(id: string, ranAt: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "ag1",
    agent_version: 7,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: ranAt,
    finished_at: ranAt,
    case_ids: ["c1"],
    skills: [],
    cases_total: 4,
    cases_completed: 4,
    cases_passed: 3,
    cases_errored: 0,
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.8,
    cost_usd: null,
    duration_ms: null,
    error: null,
    ...over,
  };
}

describe("RegressionBanner look", () => {
  it("keeps the note role, name and sentences; amber tone with a decorative icon (AC-18)", async () => {
    mockFetch({
      "GET /agents/ag1/eval-runs": [
        run("new", "2026-10-12T10:00:00Z", { precision: 0.78, citation_accuracy: 0.9 }),
        run("old", "2026-10-11T10:00:00Z"),
      ],
    });
    renderWithProviders(<RegressionBanner agentId="ag1" />);
    const note = await screen.findByRole("note", { name: "Regression" });
    expect(note).toHaveTextContent("Precision dipped 2 pts on v7. Citation up.");
    expect(note.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(note.style.borderColor).toBe("var(--warn)");
    expect(note.style.borderColor).not.toContain("crit");
    expect(note.style.background).toContain("var(--warn-bg)");
  });
});

describe("RegressionBanner, skill owner (Spec G2 AC-12)", () => {
  it("reads skill suites and names the skill version", async () => {
    const calls = mockFetch({
      "GET /skills/s1/eval-runs": [
        run("new", "2026-10-12T10:00:00Z", { precision: 0.78, owner_kind: "skill", skill_id: "s1", skill_version: 3 }),
        run("old", "2026-10-11T10:00:00Z", { owner_kind: "skill", skill_id: "s1", skill_version: 2 }),
      ],
    });
    renderWithProviders(<RegressionBanner owner={{ kind: "skill", id: "s1" }} />);
    expect(await screen.findByRole("note", { name: "Regression" })).toHaveTextContent("Precision dipped 2 pts on v3.");
    expect(calls.map((c) => c.path)).toEqual(["/skills/s1/eval-runs"]);
  });
});
