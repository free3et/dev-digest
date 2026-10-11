/**
 * The drawer's Stats row must apply the same "no data vs. free" rule as the PR
 * list and the timeline: a priced run shows its cost, an unpriced one shows an
 * em dash — never "$0.00" for a run that simply has no cost recorded.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [];

function baseTrace(statsOverride: Partial<RunTrace["stats"]>): RunTrace {
  return {
    config: {
      agent: "Security Reviewer",
      version: "1",
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
      pr: 482,
      source: "local",
    },
    stats: {
      duration_ms: 8200,
      tokens_in: 9000,
      tokens_out: 119,
      cost_usd: null,
      findings: 0,
      grounding: "0/0 passed",
      ...statsOverride,
    },
    prompt_assembly: { system: "You are a reviewer.", user: "Review PR #482" },
    tool_calls: [],
    raw_output: '{"verdict":"approved"}',
    memory_pulled: [],
    specs_read: [],
    log: [],
  };
}

function renderBody(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={trace} findings={FINDINGS} />
    </NextIntlClientProvider>,
  );
}

describe("TraceBody — Stats row cost tile", () => {
  it("shows the run's cost when it is priced", () => {
    renderBody(baseTrace({ cost_usd: 0.0013 }));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("shows an em dash, not $0.00, when the run has no cost recorded", () => {
    renderBody(baseTrace({ cost_usd: null }));
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("TraceBody — Prompt assembly skills", () => {
  it("renders the skills block when prompt_assembly.skills is present", () => {
    const trace = baseTrace({ cost_usd: null });
    trace.prompt_assembly = {
      ...trace.prompt_assembly,
      skills: "# Test Coverage Nudge\n\nCheck tests.",
    };
    renderBody(trace);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
  });

  it("hides the skills block when prompt_assembly.skills is omitted", () => {
    renderBody(baseTrace({ cost_usd: null }));
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });
});

describe("TraceBody — attached specs in Configuration", () => {
  it("shows ≈ N tok per specs_read path from specs_tokens", () => {
    const trace = baseTrace({});
    trace.specs_read = ["specs/a.md", "docs/b.md"];
    trace.specs_tokens = [
      { path: "docs/b.md", approx_tokens: 1200 },
      { path: "specs/a.md", approx_tokens: 40 },
    ];
    renderBody(trace);
    expect(screen.getByText("specs/a.md").textContent).toBe("specs/a.md ≈ 40 tok");
    expect(screen.getByText("docs/b.md").textContent).toBe("docs/b.md ≈ 1 200 tok");
  });

  it("an old trace without specs_tokens shows paths only", () => {
    const trace = baseTrace({});
    trace.specs_read = ["specs/a.md"];
    renderBody(trace);
    expect(screen.getByText("specs/a.md").textContent).toBe("specs/a.md");
    expect(screen.queryByText(/tok$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Specs missing")).not.toBeInTheDocument();
  });

  it("lists specs_missing under a Specs missing row, and hides the row when empty", () => {
    const trace = baseTrace({});
    trace.specs_missing = ["specs/gone.md"];
    const { unmount } = renderBody(trace);
    expect(screen.getByText("Specs missing")).toBeInTheDocument();
    expect(screen.getByText("specs/gone.md")).toBeInTheDocument();
    unmount();
    trace.specs_missing = [];
    renderBody(trace);
    expect(screen.queryByText("Specs missing")).not.toBeInTheDocument();
  });
});

describe("TraceBody — Prompt assembly specs block", () => {
  it("labels the block as untrusted attached specs and shows the full text when expanded", () => {
    const trace = baseTrace({});
    trace.prompt_assembly = { ...trace.prompt_assembly, specs: "## Project context\nSPEC-BODY-LINE-1\nSPEC-BODY-LINE-2" };
    renderBody(trace);
    fireEvent.click(screen.getByText("Prompt assembly"));
    const label = screen.getByText("Project context — attached specs (untrusted)");
    expect(screen.queryByText(/SPEC-BODY-LINE-1/)).not.toBeInTheDocument();
    fireEvent.click(label);
    expect(screen.getByText(/SPEC-BODY-LINE-1\s+SPEC-BODY-LINE-2/)).toBeInTheDocument();
  });
});
