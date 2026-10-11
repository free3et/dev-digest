import { describe, it, expect } from "vitest";
import { diffFocusQuery } from "./helpers";

describe("diffFocusQuery", () => {
  it("sets tab, file and line", () => {
    const sp = new URLSearchParams(diffFocusQuery("tab=overview", "src/a.ts", 12));
    expect(sp.get("tab")).toBe("diff");
    expect(sp.get("file")).toBe("src/a.ts");
    expect(sp.get("line")).toBe("12");
  });

  it("omits line when null and drops a stale one", () => {
    const sp = new URLSearchParams(diffFocusQuery("tab=diff&file=x&line=3", "src/a.ts", null));
    expect(sp.has("line")).toBe(false);
    expect(sp.get("file")).toBe("src/a.ts");
  });

  it("keeps other params and encodes the path", () => {
    const q = diffFocusQuery(new URLSearchParams("trace=run1"), "a b/c.ts", null);
    expect(new URLSearchParams(q).get("trace")).toBe("run1");
    expect(new URLSearchParams(q).get("file")).toBe("a b/c.ts");
  });
});
