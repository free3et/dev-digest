import { describe, expect, it } from "vitest";
import type { EvalDryRunResult, EvalExpectationInput } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import {
  bannerKey,
  modalErrorKey,
  resultView,
  saveBlockReason,
  subtitleKey,
  toJsonText,
  validateExpectationText,
} from "./helpers";

const EXPECTED: EvalExpectationInput = {
  kind: "must_find",
  file: "src/config.ts",
  start_line: 10,
  end_line: 12,
  title: "Hardcoded key",
  severity: "CRITICAL",
  category: "security",
};
const DRAFT = { input_files: ["src/config.ts"], expected_output: EXPECTED };

function check(over: Record<string, unknown>) {
  return validateExpectationText(JSON.stringify({ ...EXPECTED, ...over }), DRAFT);
}

describe("validateExpectationText", () => {
  it("accepts the draft's own JSON text and returns the parsed value", () => {
    expect(validateExpectationText(toJsonText(EXPECTED), DRAFT)).toEqual({ ok: true, value: EXPECTED });
  });

  it("names the first problem for each kind of invalid text", () => {
    expect(validateExpectationText("{ nope", DRAFT)).toMatchObject({ ok: false, reason: "parse" });
    expect(check({ end_line: 3 })).toMatchObject({ ok: false, reason: "range" });
    expect(check({ start_line: 0 })).toMatchObject({ ok: false, reason: "shape", params: { path: "start_line" } });
    expect(check({ source: { finding_id: "x" } })).toMatchObject({
      ok: false,
      reason: "unknownKey",
      params: { path: "source" },
    });
    expect(validateExpectationText("[]", DRAFT)).toMatchObject({ ok: false, reason: "shape" });
    expect(check({ file: "src/other.ts" })).toMatchObject({
      ok: false,
      reason: "fileMismatch",
      params: { file: "src/config.ts" },
    });
    expect(check({ kind: "must_not_flag" })).toMatchObject({
      ok: false,
      reason: "kindMismatch",
      params: { kind: "must_find" },
    });
  });
});

describe("keys", () => {
  it("picks banner and subtitle keys by kind", () => {
    expect(bannerKey("must_find")).toBe("banner.mustFind");
    expect(bannerKey("must_not_flag")).toBe("banner.mustNotFlag");
    expect(subtitleKey("must_find")).toBe("subtitle.mustFind");
    expect(subtitleKey("must_not_flag")).toBe("subtitle.mustNotFlag");
  });
});

describe("saveBlockReason", () => {
  const ok = { ok: true, value: EXPECTED } as const;
  const bad = { ok: false, reason: "parse", params: {} } as const;
  it("blocks on a blank (trimmed) name first, then on invalid JSON", () => {
    expect(saveBlockReason("", ok)).toBe("name");
    expect(saveBlockReason("   ", ok)).toBe("name");
    expect(saveBlockReason("  ", bad)).toBe("name");
    expect(saveBlockReason("n", bad)).toBe("json");
    expect(saveBlockReason(" n ", ok)).toBeNull();
  });
});

describe("resultView", () => {
  const base: EvalDryRunResult = {
    outcome: "passed",
    pass: true,
    expectation_kind: "must_find",
    matched: true,
    matched_count: 1,
    findings_kept: 2,
    findings_dropped: 1,
    kept: [],
    dropped: [],
    duration_ms: 1840,
    cost_usd: 0.02,
    agent_version: 3,
    skill_version: null,
    error: null,
  };

  it("maps a passed, a failed and a must_not_flag result", () => {
    expect(resultView(base)).toEqual({
      headingKey: "lastRunPassed",
      errored: false,
      expected: { key: "result.expectedMustFind", count: 1 },
      kept: 2,
      dropped: 1,
      seconds: "1.8",
      cost: "$0.02",
      error: null,
    });
    expect(resultView({ ...base, outcome: "failed", pass: false, matched_count: 0 })).toMatchObject({
      headingKey: "lastRunFailed",
      expected: { key: "result.expectedMustFind", count: 0 },
    });
    expect(resultView({ ...base, expectation_kind: "must_not_flag", matched_count: 2 }).expected).toEqual({
      key: "result.expectedMustNotFlag",
      count: 2,
    });
  });

  it("shows the error text and an empty cost for an errored run", () => {
    const v = resultView({
      ...base,
      outcome: "error",
      pass: null,
      matched: null,
      matched_count: null,
      findings_kept: null,
      findings_dropped: null,
      cost_usd: null,
      error: "timed out",
    });
    expect(v).toMatchObject({
      headingKey: "result.lastRunErrored",
      errored: true,
      expected: null,
      kept: null,
      cost: "—",
      error: "timed out",
    });
  });
});

describe("modalErrorKey", () => {
  it("keys R-1 and R-3 refusals by ApiError.code", () => {
    for (const code of [
      "finding_undecided",
      "no_agent",
      "duplicate",
      "patch_unavailable",
      "not_found",
      "validation_error",
      "file_not_in_diff",
      "kind_mismatch",
    ]) {
      expect(modalErrorKey(new ApiError("x", 422, code))).toBe(code);
    }
  });

  it("falls back by status: 429, 413, network, unknown", () => {
    expect(modalErrorKey(new ApiError("x", 429))).toBe("rate_limited");
    expect(modalErrorKey(new ApiError("x", 413, "internal_error"))).toBe("payload_too_large");
    expect(modalErrorKey(new ApiError("x", 0, "network_error"))).toBe("network_error");
    expect(modalErrorKey(new TypeError("fetch failed"))).toBe("network_error");
    expect(modalErrorKey(new ApiError("x", 500, "boom"))).toBe("unknown");
  });
});
