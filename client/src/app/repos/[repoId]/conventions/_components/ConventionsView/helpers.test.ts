import { describe, expect, it } from "vitest";
import { acceptedCount, evidenceHref, evidenceRangeLabel, skillNameForRepo } from "./helpers";
import type { ConventionCandidate } from "@devdigest/shared";

const row = (patch: Partial<ConventionCandidate>): ConventionCandidate => ({
  id: "1",
  rule: "Use AppError",
  evidence_path: "src/a.ts",
  evidence_snippet: "throw new AppError()",
  evidence_line: 4,
  category: "errors",
  confidence: 0.8,
  accepted: false,
  ...patch,
});

describe("conventions helpers", () => {
  it("counts only accepted rows", () => {
    expect(acceptedCount([row({}), row({ id: "2", accepted: true })])).toBe(1);
  });

  it("builds a GitHub blob URL with #L when the line is known", () => {
    expect(evidenceHref("acme/api", "main", "src/a.ts", 4)).toBe(
      "https://github.com/acme/api/blob/main/src/a.ts#L4",
    );
  });

  it("omits #L when the line is null", () => {
    expect(evidenceHref("acme/api", "main", "src/a.ts", null)).toBe(
      "https://github.com/acme/api/blob/main/src/a.ts",
    );
  });

  it("names the skill after the repo, like the homework mock", () => {
    expect(skillNameForRepo("acme/payments-api")).toBe("payments-api-conventions");
  });

  it("shows a line range when the snippet spans more than one line", () => {
    expect(evidenceRangeLabel("src/api/users.ts", 23, "a\nb\nc")).toBe("src/api/users.ts:23-25");
    expect(evidenceRangeLabel("src/a.ts", 4, "one line")).toBe("src/a.ts:4");
  });
});
