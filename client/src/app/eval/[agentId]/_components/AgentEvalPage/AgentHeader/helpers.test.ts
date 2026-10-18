import { describe, expect, it } from "vitest";
import { subtitleFor } from "./helpers";

const ids = (n: number, prefix = "c") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const run = (status: "done" | "partial" | "running" | "failed", case_ids: string[]) => ({ status, case_ids });

describe("subtitleFor", () => {
  it("is none without finished runs, including only running and failed runs", () => {
    expect(subtitleFor([])).toEqual({ kind: "none" });
    expect(subtitleFor([run("running", ids(3)), run("failed", ids(3))])).toEqual({ kind: "none" });
  });

  it("is same with the finished count and the common case count", () => {
    const runs = Array.from({ length: 5 }, () => run("done", ids(8)));
    expect(subtitleFor(runs)).toEqual({ kind: "same", count: 5, cases: 8 });
    expect(subtitleFor([run("partial", ids(2))])).toEqual({ kind: "same", count: 1, cases: 2 });
  });

  it("ignores running and failed runs, even with other case sets", () => {
    const runs = [run("running", ids(2, "x")), run("done", ids(8)), run("failed", ids(1, "y")), run("done", [...ids(8)].reverse())];
    expect(subtitleFor(runs)).toEqual({ kind: "same", count: 2, cases: 8 });
  });

  it("is different when the finished runs ran over different sets", () => {
    expect(subtitleFor([run("done", ids(8)), run("done", ids(7))])).toEqual({ kind: "different", count: 2 });
    expect(subtitleFor([run("done", ids(2, "a")), run("done", ids(2, "b"))])).toEqual({ kind: "different", count: 2 });
  });
});
