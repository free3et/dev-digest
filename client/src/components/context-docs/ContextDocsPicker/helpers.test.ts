import { describe, it, expect } from "vitest";
import { CONTEXT_DOC_MAX_BYTES } from "@devdigest/shared";
import type { ContextAttachment, InheritedContextAttachment, SpecFile } from "@devdigest/shared";
import {
  attach, attachedCount, buildRows, detach, filterRows, move, moveToTarget, resolveOwn, serializeLines, totals,
} from "./helpers";

const att = (path: string, tokens: number | null, o: Partial<ContextAttachment> = {}): ContextAttachment => ({
  path, doc_type: "specs", approx_tokens: tokens, missing: false, too_large: false, ...o,
});
const inh = (path: string, tokens: number | null, skill: string, o: Partial<ContextAttachment> = {}): InheritedContextAttachment => ({
  ...att(path, tokens, o), skill_id: `id-${skill}`, skill_name: skill,
});
const doc = (path: string, tokens = 10, size = 100): SpecFile => ({
  path, doc_type: "docs", approx_tokens: tokens, size, used_by_agents: 0,
});

describe("buildRows", () => {
  it("orders own, inherited, then the rest by path, each path once", () => {
    const rows = buildRows(
      [att("specs/b.md", 5), att("docs/z.md", 7)],
      [inh("docs/i.md", 3, "arch"), inh("specs/b.md", 3, "arch")],
      [doc("specs/b.md"), doc("docs/z.md"), doc("docs/i.md"), doc("docs/y.md"), doc("docs/a.md")],
    );
    expect(rows.map((r) => [r.path, r.kind])).toEqual([
      ["specs/b.md", "own"], ["docs/z.md", "own"], ["docs/i.md", "inherited"], ["docs/a.md", "repo"], ["docs/y.md", "repo"],
    ]);
    expect(rows[2]?.skillName).toBe("arch");
  });

  it("splits name and folder, flags oversized repo documents", () => {
    const [row] = buildRows([], [], [doc("specs/deep/a.md", 1, 300_000)]);
    expect(row).toMatchObject({ name: "a.md", folder: "specs/deep", tooLarge: true });
  });
});

describe("filterRows", () => {
  it("matches path substrings case-insensitively", () => {
    const rows = buildRows([], [], [doc("specs/Arch.md"), doc("docs/other.md")]);
    expect(filterRows(rows, "ARCH").map((r) => r.path)).toEqual(["specs/Arch.md"]);
    expect(filterRows(rows, "  ")).toHaveLength(2);
  });
});

describe("totals and counts", () => {
  it("counts attached tokens only; missing and too_large add 0", () => {
    const own = [att("a.md", 10), att("b.md", null, { missing: true }), att("c.md", null, { too_large: true })];
    const inherited = [inh("d.md", 4, "s"), inh("e.md", null, "s", { too_large: true })];
    expect(totals(own, inherited)).toEqual({ own: 10, inherited: 4, total: 14 });
  });

  it("K counts own attachments, N the repo documents", () => {
    expect(attachedCount([att("a.md", 1)], [doc("a.md"), doc("b.md"), doc("c.md")])).toEqual({ attached: 1, total: 3 });
  });
});

describe("too_large threshold", () => {
  it("uses the shared CONTEXT_DOC_MAX_BYTES (262144 ok, 262145 too large)", () => {
    expect(CONTEXT_DOC_MAX_BYTES).toBe(262_144);
    const rows = buildRows([], [], [doc("a.md", 1, 262_144), doc("b.md", 1, 262_145)]);
    expect(rows.map((r) => r.tooLarge)).toEqual([false, true]);
    const own = resolveOwn(["a.md", "b.md"], [], [doc("a.md", 1, 262_144), doc("b.md", 1, 262_145)]);
    expect(own.map((a) => a.too_large)).toEqual([false, true]);
  });
});

describe("resolveOwn", () => {
  it("prefers server data, falls back to the document list, else missing", () => {
    const out = resolveOwn(["a.md", "b.md", "gone.md", "big.md"], [att("a.md", 5)], [doc("b.md", 8), doc("big.md", 99, 300_000)]);
    expect(out[0]).toMatchObject({ path: "a.md", approx_tokens: 5 });
    expect(out[1]).toMatchObject({ path: "b.md", approx_tokens: 8, missing: false });
    expect(out[2]).toMatchObject({ path: "gone.md", missing: true, approx_tokens: null });
    expect(out[3]).toMatchObject({ too_large: true, approx_tokens: null });
  });
});

describe("list edits", () => {
  it("attaches once, detaches, moves", () => {
    expect(attach(["a"], "b")).toEqual(["a", "b"]);
    expect(attach(["a"], "a")).toEqual(["a"]);
    expect(detach(["a", "b"], "a")).toEqual(["b"]);
    expect(move(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveToTarget(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });
});

describe("serializeLines", () => {
  it("emits the heading then one line per path in own order", () => {
    expect(serializeLines(["b.md", "a.md"])).toEqual(["## Project context", "- b.md", "- a.md"]);
    expect(serializeLines([])).toEqual(["## Project context"]);
  });
});
