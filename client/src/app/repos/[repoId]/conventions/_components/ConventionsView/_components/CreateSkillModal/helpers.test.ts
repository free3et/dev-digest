import { describe, expect, it } from "vitest";
import { fileNameFor, lineNumbers } from "./helpers";

describe("CreateSkillModal helpers", () => {
  it("numbers every line including a trailing blank one", () => {
    expect(lineNumbers("a\nb\n")).toEqual([1, 2, 3]);
  });

  it("builds the editor file name from the skill name", () => {
    expect(fileNameFor("api-conventions")).toBe("api-conventions.md");
  });
});
