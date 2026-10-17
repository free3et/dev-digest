import { describe, expect, it } from "vitest";
import { regressionBanner } from "./helpers";

type Status = "done" | "partial" | "running" | "failed";
interface R {
  status: Status;
  agent_version: number;
  case_ids: string[];
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

function run(over: Partial<R> = {}): R {
  return {
    status: "done",
    agent_version: 7,
    case_ids: ["c1", "c2"],
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.8,
    ...over,
  };
}

describe("regressionBanner", () => {
  it("names a precision dip in whole points on the newest version", () => {
    const b = regressionBanner([run({ precision: 0.78 }), run({ agent_version: 6 })]);
    expect(b).toEqual({
      version: 7,
      dips: [{ metric: "precision", points: 2, belowOne: false }],
      ups: [],
      differentCaseSets: false,
    });
  });

  it("flags a dip that rounds to 0 points as belowOne, and a one-point dip as 1", () => {
    const tiny = regressionBanner([run({ precision: 0.798, recall: 0.8 }), run({ precision: 0.801 })]);
    expect(tiny?.dips).toEqual([{ metric: "precision", points: 0, belowOne: true }]);
    const one = regressionBanner([run({ recall: 0.79 }), run()]);
    expect(one?.dips).toEqual([{ metric: "recall", points: 1, belowOne: false }]);
  });

  it("skips running and failed runs between the two finished runs", () => {
    const b = regressionBanner([
      run({ status: "running", precision: null }),
      run({ precision: 0.7 }),
      run({ status: "failed", precision: 0.99 }),
      run({ status: "partial", agent_version: 6 }),
    ]);
    expect(b?.dips).toEqual([{ metric: "precision", points: 10, belowOne: false }]);
    expect(b?.version).toBe(7);
  });

  it("is null with fewer than two finished runs", () => {
    expect(regressionBanner([])).toBeNull();
    expect(regressionBanner([run({ precision: 0.1 })])).toBeNull();
    expect(regressionBanner([run({ precision: 0.1 }), run({ status: "running" }), run({ status: "failed" })])).toBeNull();
  });

  it("is null when nothing dips, when only recall goes up, and on a citation-only dip", () => {
    expect(regressionBanner([run(), run()])).toBeNull();
    expect(regressionBanner([run({ recall: 0.9 }), run()])).toBeNull();
    expect(regressionBanner([run({ citation_accuracy: 0.5 }), run()])).toBeNull();
  });

  it("is null when recall and precision are null on either side", () => {
    expect(regressionBanner([run({ recall: null, precision: null }), run()])).toBeNull();
    expect(regressionBanner([run(), run({ recall: null, precision: null })])).toBeNull();
  });

  it("lists the metrics that went up, and leaves null or unchanged metrics out", () => {
    const both = regressionBanner([run({ precision: 0.7, recall: 0.9, citation_accuracy: 0.9 }), run()]);
    expect(both?.ups).toEqual(["recall", "citation"]);
    const one = regressionBanner([run({ precision: 0.7, recall: 0.9 }), run()]);
    expect(one?.ups).toEqual(["recall"]);
    const none = regressionBanner([run({ precision: 0.7, citation_accuracy: null }), run()]);
    expect(none?.ups).toEqual([]);
  });

  it("keeps citation in the dips when it dipped too, in recall / precision / citation order", () => {
    const b = regressionBanner([run({ recall: 0.7, precision: 0.7, citation_accuracy: 0.7 }), run()]);
    expect(b?.dips.map((d) => d.metric)).toEqual(["recall", "precision", "citation"]);
  });

  it("flags differing case sets and ignores order", () => {
    const base = run({ precision: 0.7 });
    expect(regressionBanner([base, run({ case_ids: ["c1", "c3"] })])?.differentCaseSets).toBe(true);
    expect(regressionBanner([base, run({ case_ids: ["c2", "c1"] })])?.differentCaseSets).toBe(false);
  });
});

describe("regressionBanner with a version getter (Spec G2 AC-12)", () => {
  it("reports the skill version when the getter picks it, and the agent version by default", () => {
    const newest = { ...run({ precision: 0.78, agent_version: 7 }), skill_version: 3 };
    const prev = { ...run({ agent_version: 6 }), skill_version: 2 };
    expect(regressionBanner([newest, prev], (r) => r.skill_version ?? r.agent_version)?.version).toBe(3);
    expect(regressionBanner([newest, prev])?.version).toBe(7);
  });
});
