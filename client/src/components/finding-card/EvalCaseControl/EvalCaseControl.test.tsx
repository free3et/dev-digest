import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { EvalCaseControl } from "./EvalCaseControl";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: "2026-10-12T10:00:00Z",
  dismissed_at: null,
};

const EXISTING_CASE = {
  id: "c1",
  expected_output: { kind: "must_find", source: { finding_id: "f1" } },
};

const DRAFT = {
  finding_id: "f1",
  agent_id: "ag1",
  name: "src/config.ts:11 Hardcoded key",
  input_diff: "@@ -10,3 +10,4 @@\n+  const key = 'x';",
  input_files: ["src/config.ts"],
  input_meta: { pr_number: 7, pr_title: "t", pr_body: null, repo: "o/r" },
  expected_output: {
    kind: "must_find",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    title: "Hardcoded key",
    severity: "CRITICAL",
    category: "security",
  },
};

interface Seen {
  method: string;
  path: string;
  body: unknown;
}

/** Stateful fetch stub: lists no case until a create POST succeeded; `dryRun` may stay pending. */
function stubApi(opts: { drafts?: unknown[]; dryRun?: Promise<unknown> } = {}) {
  const seen: Seen[] = [];
  const drafts = [...(opts.drafts ?? [DRAFT])];
  let created = false;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const method = (init?.method ?? "GET").toUpperCase();
      seen.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "GET" && path === "/agents/ag1/eval-cases") return json(created ? [EXISTING_CASE] : []);
      if (method === "GET" && path === "/findings/f1/eval-case/draft") {
        return json(drafts.length > 1 ? drafts.shift() : drafts[0]);
      }
      if (method === "POST" && path === "/findings/f1/eval-case/dry-run") {
        return json(await (opts.dryRun ?? new Promise(() => {})));
      }
      if (method === "POST" && path === "/findings/f1/eval-case") {
        created = true;
        return json({ id: "c1" }, 201);
      }
      return json({ error: { code: "not_found", message: "nope" } }, 404);
    }),
  );
  return seen;
}

const posts = (seen: Seen[]) => seen.filter((c) => c.method === "POST");
const button = () => screen.findByRole("button", { name: /must find/i });

describe("EvalCaseControl", () => {
  it("offers a button named by the expectation; a click opens the modal and only reads the draft", async () => {
    const seen = stubApi();
    renderWithProviders(<EvalCaseControl f={FINDING} agentId="ag1" />);
    fireEvent.click(await button());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await screen.findByRole("textbox", { name: "Name" });
    expect(seen.filter((c) => c.path === "/findings/f1/eval-case/draft")).toHaveLength(1);
    expect(posts(seen)).toHaveLength(0);
  });

  it("names must not flag for a dismissed finding", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": [] });
    renderWithProviders(
      <EvalCaseControl f={{ ...FINDING, accepted_at: null, dismissed_at: "t" }} agentId="ag1" />,
    );
    expect(await screen.findByRole("button", { name: /must not flag/i })).toBeInTheDocument();
  });

  it("shows an In eval set link to the Evals tab when a case exists", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": [EXISTING_CASE] });
    renderWithProviders(<EvalCaseControl f={FINDING} agentId="ag1" />);
    const link = await screen.findByRole("link", { name: "In eval set" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("saves the trimmed name and the parsed expectation, then swaps the button for the link", async () => {
    const seen = stubApi();
    renderWithProviders(<EvalCaseControl f={FINDING} agentId="ag1" />);
    fireEvent.click(await button());
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "  renamed  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: "In eval set" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const create = posts(seen);
    expect(create).toHaveLength(1);
    expect(create[0]?.body).toEqual({ name: "renamed", expected_output: DRAFT.expected_output });
  });

  it("closes on a Save that goes ahead of a still-running dry-run", async () => {
    const seen = stubApi();
    renderWithProviders(<EvalCaseControl f={FINDING} agentId="ag1" />);
    fireEvent.click(await button());
    await screen.findByRole("textbox", { name: "Name" });
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(posts(seen)).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("link", { name: "In eval set" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("cancelling", () => {
    const WAYS: Array<[string, () => void]> = [
      ["Cancel", () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }))],
      ["the X button", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
      ["Escape", () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })],
      [
        "the backdrop",
        () => {
          // The vendored Modal's backdrop is an unlabelled div, the dialog's
          // previous sibling; there is no role or text to query it by.
          const dialog = screen.getByRole("dialog");
          fireEvent.click(dialog.previousElementSibling as Element);
        },
      ],
    ];

    it.each(WAYS)("%s closes the modal without any POST and keeps the button", async (_label, close) => {
      const seen = stubApi();
      renderWithProviders(<EvalCaseControl f={FINDING} agentId="ag1" />);
      const opener = await button();
      opener.focus();
      fireEvent.click(opener);
      await screen.findByRole("textbox", { name: "Name" });
      close();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(posts(seen)).toHaveLength(0);
      expect(screen.getByRole("button", { name: /must find/i })).toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
  });

  it("starts a reopened modal with the fresh draft and no result from a cancelled run", async () => {
    let release: (r: unknown) => void = () => {};
    const dryRun = new Promise((res) => {
      release = res;
    });
    stubApi({ drafts: [DRAFT, { ...DRAFT, name: "second draft" }], dryRun });
    renderWithProviders(<EvalCaseControl f={FINDING} agentId="ag1" />);
    fireEvent.click(await button());
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Running/ })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    release({
      outcome: "passed",
      pass: true,
      expectation_kind: "must_find",
      matched: true,
      matched_count: 1,
      findings_kept: 1,
      findings_dropped: 0,
      kept: [],
      dropped: [],
      duration_ms: 1000,
      cost_usd: 0.01,
      agent_version: 1,
      error: null,
    });

    fireEvent.click(await button());
    const again = await screen.findByRole("textbox", { name: "Name" });
    await waitFor(() => expect(again).toHaveValue("second draft"));
    expect(screen.queryByText(/Last run/)).toBeNull();
  });
});
