import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockFetch, renderWithProviders } from "@/test/render";
import messages from "../../../../messages/en/eval.json";
import { EvalCasesList } from "./EvalCasesList";
import { editorErrorKey } from "./CaseEditorDialog/helpers";
import { ApiError } from "@/lib/api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function evalCase(id: string, kind: "must_find" | "must_not_flag", file: string, line: number) {
  return {
    id,
    owner_kind: "agent",
    owner_id: "ag1",
    name: `${file}:${line} title ${id}`,
    input_diff: "",
    input_files: [file],
    input_meta: { pr_number: 1, pr_title: "t", pr_body: null, repo: "o/r" },
    expected_output: {
      kind,
      file,
      start_line: line,
      end_line: line,
      title: `title ${id}`,
      severity: "WARNING",
      category: "security",
      source: {
        finding_id: `f-${id}`,
        review_id: "r1",
        pr_id: "pr1",
        repo: "o/r",
        head_sha: "abc",
        agent_id: "ag1",
        run_id: null,
      },
    },
    notes: null,
  };
}

const CASES = [
  evalCase("c1", "must_find", "src/a.ts", 12),
  evalCase("c2", "must_not_flag", "src/very/long/path/to/some/file.ts", 7),
];

describe("EvalCasesList", () => {
  it("lists cases with a text kind badge and file:line, truncating long paths", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": CASES });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(screen.getByText("Loading cases…")).toBeInTheDocument();
    expect(await screen.findByText("Must find")).toBeInTheDocument();
    expect(screen.getByText("Must not flag")).toBeInTheDocument();
    expect(screen.queryByText("must find")).toBeNull();
    expect(screen.queryByText("must not flag")).toBeNull();
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument();
    const long = screen.getByText("src/very/long/path/to/some/file.ts:7");
    expect(long.style.whiteSpace).toBe("nowrap");
    expect(long.style.textOverflow).toBe("ellipsis");
    expect(long).toHaveAttribute("title", "src/very/long/path/to/some/file.ts:7");
  });

  it("names the kind badges for assistive tech and tooltips, in capitals by styling (AC-14)", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": CASES });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(await screen.findByLabelText("Positive case · must find")).toBeInTheDocument();
    expect(screen.getByTitle("Negative case · must not flag")).toBeInTheDocument();
    expect(screen.getByText("Must find").style.textTransform).toBe("uppercase");
    expect(messages.evalsTab.kind.must_findName).toBe("Positive case · must find");
    expect(messages.evalsTab.kind.must_not_flagName).toBe("Negative case · must not flag");
    expect(messages.evalsTab.kind.must_find).toMatch(/[a-z]/);
  });

  it("puts name and location on separate lines, badge first, name flexible (AC-15, NFR-3)", async () => {
    const hostile = { ...evalCase("c3", "must_find", "src/x.ts", 3), name: "<script>alert(1)</script>" };
    mockFetch({ "GET /agents/ag1/eval-cases": [hostile] });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    const name = await screen.findByText("<script>alert(1)</script>");
    expect(document.querySelector("script")).toBeNull();
    const location = screen.getByText("src/x.ts:3");
    expect(name.parentElement).not.toBe(location.parentElement);
    expect(name.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name).toHaveAttribute("title", "<script>alert(1)</script>");
    expect(name.style.flexGrow).toBe("1");
    expect(name.style.minWidth).toBe("0");
    expect(name.style.textOverflow).toBe("ellipsis");
    const badge = screen.getByLabelText("Positive case · must find");
    expect(badge.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the empty-state text when there are no cases", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": [] });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(await screen.findByText(/No eval cases yet/)).toBeInTheDocument();
  });

  it("deletes only after confirmation", async () => {
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "DELETE /eval-cases/c1": { ok: true },
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Delete eval case “src\/a.ts:12/ }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Delete eval case “src\/a.ts:12/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.path === "/eval-cases/c1")).toBe(true),
    );
  });

  it("runs one case and shows its outcome, kept count and cost", async () => {
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "POST /eval-cases/c1/run": {
        outcome: "passed",
        pass: true,
        expectation_kind: "must_find",
        matched: true,
        matched_count: 1,
        findings_kept: 2,
        findings_dropped: 0,
        kept: [],
        dropped: [],
        duration_ms: 1200,
        cost_usd: 0.0012,
        agent_version: 3,
        error: null,
      },
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Run eval case “src\/a.ts:12/ }));
    expect((await screen.findByText("Passed")).parentElement).toHaveTextContent(/Passed.*2 findings kept/);
    expect(calls.some((c) => c.method === "POST" && c.path === "/eval-cases/c1/run")).toBe(true);
  });

  it("edits a case in the two-column dialog: sends name and JSON without source, then refetches", async () => {
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "PATCH /eval-cases/c1": CASES[0],
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit eval case “src\/a.ts:12/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Renamed" } });
    const json = within(dialog).getByLabelText("Expected output") as HTMLTextAreaElement;
    expect(json.value).not.toContain("source");
    fireEvent.change(json, {
      target: { value: JSON.stringify({ ...JSON.parse(json.value), kind: "must_not_flag", end_line: 14 }) },
    });
    expect(within(dialog).getByText("valid JSON")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Run on save" })); // off: close after save
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const body = calls.find((c) => c.method === "PATCH")!.body as {
      name: string;
      expected_output: Record<string, unknown>;
    };
    expect(body.name).toBe("Renamed");
    expect(body.expected_output).toMatchObject({ kind: "must_not_flag", start_line: 12, end_line: 14 });
    expect(body.expected_output).not.toHaveProperty("source");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("blocks Save while the JSON is invalid or the file leaves the frozen diff", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": CASES });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit eval case “src\/a.ts:12/ }));
    const dialog = screen.getByRole("dialog");
    const json = within(dialog).getByLabelText("Expected output") as HTMLTextAreaElement;
    fireEvent.change(json, { target: { value: "{ nope" } });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByText("invalid JSON")).toBeInTheDocument();
    fireEvent.change(json, { target: { value: JSON.stringify({ ...CASES[0]!.expected_output, source: undefined, file: "other.ts" }) } });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByText(/file must be src\/a.ts/)).toBeInTheDocument();
  });

  it("Run case in the edit dialog scores the stored case against the JSON on screen", async () => {
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "POST /eval-cases/c1/run": {
        outcome: "passed", pass: true, expectation_kind: "must_find", matched: true, matched_count: 1,
        findings_kept: 1, findings_dropped: 0, kept: [], dropped: [], duration_ms: 900, cost_usd: 0.001,
        agent_version: 2, error: null,
      },
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit eval case “src\/a.ts:12/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Run case" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent(/passed/i);
    const call = calls.find((c) => c.path === "/eval-cases/c1/run")!;
    expect((call.body as { expected_output: { file: string } }).expected_output.file).toBe("src/a.ts");
  });

  it("creates a case by hand: pasted diff + JSON, Save blocked until the diff is there", async () => {
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "POST /agents/ag1/eval-cases": CASES[0],
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    fireEvent.click(await screen.findByRole("button", { name: "New eval case" }));
    const dialog = screen.getByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "stripe-key-leak" } });
    expect(save).toBeDisabled(); // no diff yet
    fireEvent.change(within(dialog).getByLabelText(/Diff \(hunks/), { target: { value: "@@ -1 +1 @@\n+x" } });
    expect(save).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Run on save" }));
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const body = calls.find((c) => c.method === "POST")!.body as {
      name: string; patch: string; expected_output: Record<string, unknown>;
    };
    expect(body).toMatchObject({ name: "stripe-key-leak", patch: "@@ -1 +1 @@\n+x" });
    expect(body.expected_output).toMatchObject({ kind: "must_find", file: "src/example.ts" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows an inline error for 409 eval_run_in_progress and keeps the row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify(CASES), { status: 200 });
        }
        return new Response(
          JSON.stringify({ error: { code: "eval_run_in_progress", message: "busy" } }),
          { status: 409 },
        );
      }),
    );
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Delete eval case “src\/a.ts:12/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/eval_run_in_progress/);
    expect(screen.queryByRole("dialog")).toBeNull();
    // Spec G3 AC-5: the stub answers the runs request with a list without a finished suite, so the row reads "never run · …".
    expect(screen.getByText("never run · src/a.ts:12")).toBeInTheDocument();
  });

  it("offers Retry when the list fails to load", async () => {
    mockFetch({});
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("EvalCasesList, skill owner (Spec G2)", () => {
  const SKILL: { kind: "skill"; id: string } = { kind: "skill", id: "s1" };
  const HOST = { id: "h1", name: "Reviewer A", model: "gpt-x" };
  const SKILL_CASES = CASES.map((c) => ({ ...c, owner_kind: "skill", owner_id: "s1" }));
  const RUN_OK = {
    outcome: "passed", pass: true, expectation_kind: "must_find", matched: true, matched_count: 1,
    findings_kept: 1, findings_dropped: 0, kept: [], dropped: [], duration_ms: 900, cost_usd: 0.001,
    agent_version: 2, skill_version: 3, error: null,
  };

  it("lists the skill's cases, deletes after confirmation and refetches the skill list", async () => {
    const calls = mockFetch({ "GET /skills/s1/eval-cases": SKILL_CASES, "DELETE /eval-cases/c1": { ok: true } });
    renderWithProviders(<EvalCasesList owner={SKILL} host={HOST} />);
    expect(await screen.findByText("Must find")).toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith("/agents/"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Delete eval case “src\/a.ts:12/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/eval-cases/c1")).toBe(true));
    await waitFor(() => expect(calls.filter((c) => c.path === "/skills/s1/eval-cases" && c.method === "GET")).toHaveLength(2));
  });

  it("names the skill in the empty text and offers Retry on a load error", async () => {
    mockFetch({ "GET /skills/s1/eval-cases": [] });
    const { unmount } = renderWithProviders(<EvalCasesList owner={SKILL} host={HOST} />);
    expect(await screen.findByText(/No eval cases for this skill yet/)).toBeInTheDocument();
    unmount();
    mockFetch({});
    renderWithProviders(<EvalCasesList owner={SKILL} host={HOST} />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("creates a hand-written case on the skill route and refetches the list", async () => {
    const calls = mockFetch({ "GET /skills/s1/eval-cases": SKILL_CASES, "POST /skills/s1/eval-cases": SKILL_CASES[0] });
    renderWithProviders(<EvalCasesList owner={SKILL} host={HOST} />);
    fireEvent.click(await screen.findByRole("button", { name: "New eval case" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "leak" } });
    fireEvent.change(within(dialog).getByLabelText(/Diff \(hunks/), { target: { value: "@@ -1 +1 @@\n+x" } });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Run on save" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/skills/s1/eval-cases")).toBe(true));
    const body = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["expected_output", "name", "patch"]);
    await waitFor(() => expect(calls.filter((c) => c.path === "/skills/s1/eval-cases" && c.method === "GET")).toHaveLength(2));
  });

  it("edits through PATCH /eval-cases/:id", async () => {
    const calls = mockFetch({ "GET /skills/s1/eval-cases": SKILL_CASES, "PATCH /eval-cases/c1": SKILL_CASES[0] });
    renderWithProviders(<EvalCasesList owner={SKILL} host={HOST} />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit eval case “src\/a.ts:12/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Run on save" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.path === "/eval-cases/c1")).toBe(true));
  });

  it("row Run and the editor's Run case carry the host agent_id", async () => {
    const calls = mockFetch({ "GET /skills/s1/eval-cases": SKILL_CASES, "POST /eval-cases/c1/run": RUN_OK });
    renderWithProviders(<EvalCasesList owner={SKILL} host={HOST} />);
    fireEvent.click(await screen.findByRole("button", { name: /Run eval case “src\/a.ts:12/ }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/eval-cases/c1/run")).toHaveLength(1));
    expect(calls.find((c) => c.path === "/eval-cases/c1/run")!.body).toEqual({ agent_id: "h1" });

    fireEvent.click(screen.getByRole("button", { name: /Edit eval case “src\/a.ts:12/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/eval-cases/c1/run")).toHaveLength(2));
    expect(calls.filter((c) => c.path === "/eval-cases/c1/run")[1]!.body).toMatchObject({ agent_id: "h1" });
  });

  it("disables running without a host, in the row and in the editor", async () => {
    mockFetch({ "GET /skills/s1/eval-cases": SKILL_CASES });
    renderWithProviders(
      <>
        <p id="hint">Pick an agent to run this skill's evals</p>
        <EvalCasesList owner={SKILL} host={null} runHintId="hint" />
      </>,
    );
    const run = await screen.findByRole("button", { name: /Run eval case “src\/a.ts:12/ });
    expect(run).toBeDisabled();
    expect(run).toHaveAccessibleDescription(/Pick an agent/);
    fireEvent.click(screen.getByRole("button", { name: /Edit eval case “src\/a.ts:12/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(within(dialog).getByRole("switch", { name: "Run on save" })).toBeDisabled();
    expect(within(dialog).getByRole("switch", { name: "Run on save" })).not.toBeChecked();
  });

  it("shows the host_not_found text on the row and re-enables Run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "GET"
          ? new Response(JSON.stringify(SKILL_CASES), { status: 200 })
          : new Response(JSON.stringify({ error: { code: "host_not_found", message: "gone" } }), { status: 422 }),
      ),
    );
    renderWithProviders(<EvalCasesList owner={SKILL} host={HOST} />);
    const run = await screen.findByRole("button", { name: /Run eval case “src\/a.ts:12/ });
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent(/host agent no longer exists/);
    await waitFor(() => expect(run).toBeEnabled());
  });

  it("maps editor errors: skill wording for G1 codes on a skill, the editor's own otherwise", () => {
    const err = new ApiError("x", 422, "host_not_found");
    expect(editorErrorKey(SKILL, err)).toEqual({ scope: "skill", key: "host_not_found" });
    expect(editorErrorKey({ kind: "agent", id: "a" }, new ApiError("x", 409, "eval_run_in_progress"))).toEqual({
      scope: "editor",
      key: "eval_run_in_progress",
    });
    expect(editorErrorKey(SKILL, new ApiError("x", 429, "internal_error"))).toEqual({ scope: "editor", key: "rate_limited" });
  });
});

describe("EvalCasesList row status (Spec G3)", () => {
  type Outcome = "passed" | "failed" | "error";
  const kept = (file: string, line: number) => ({ file, start_line: line, end_line: line });
  const record = (case_id: string, outcome: Outcome, findings: ReturnType<typeof kept>[] = [], error: string | null = null) => ({
    case_id,
    outcome,
    error,
    actual_output: { kept: findings },
  });
  const suite = (id: string, status: string, ranAt: string) => ({
    id,
    agent_id: "ag1",
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status,
    ran_at: ranAt,
    case_ids: [],
  });
  const detail = (id: string, status: string, ranAt: string, cases: ReturnType<typeof record>[]) => ({
    ...suite(id, status, ranAt),
    cases,
  });
  const many = (n: number) => Array.from({ length: n }, (_, i) => evalCase(`k${i}`, "must_find", "src/a.ts", i + 1));
  const heading = () => screen.getByRole("heading", { level: 3 });

  it("AC-1: counts passing current cases in the heading; a later case counts in the total only; no finished suite means no count", async () => {
    const cases = many(20);
    const recs = cases.slice(0, 17).map((c) => record(c.id, "passed", [kept("src/a.ts", 1)]));
    mockFetch({
      "GET /agents/ag1/eval-cases": cases,
      "GET /agents/ag1/eval-runs": [suite("r1", "done", "2026-10-12T10:00:00Z")],
      "GET /eval-runs/r1": detail("r1", "done", "2026-10-12T10:00:00Z", recs),
    });
    const first = renderWithProviders(<EvalCasesList agentId="ag1" />);
    await waitFor(() => expect(heading()).toHaveTextContent("Eval cases · 17/20 passing"));
    first.unmount();

    mockFetch({
      "GET /agents/ag1/eval-cases": [...cases, evalCase("late", "must_find", "src/z.ts", 1)],
      "GET /agents/ag1/eval-runs": [suite("r1", "done", "2026-10-12T10:00:00Z")],
      "GET /eval-runs/r1": detail("r1", "done", "2026-10-12T10:00:00Z", recs),
    });
    const second = renderWithProviders(<EvalCasesList agentId="ag1" />);
    await waitFor(() => expect(heading()).toHaveTextContent("Eval cases · 17/21 passing"));
    second.unmount();

    mockFetch({
      "GET /agents/ag1/eval-cases": CASES,
      "GET /agents/ag1/eval-runs": [suite("r1", "failed", "2026-10-12T10:00:00Z")],
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(await screen.findByText("never run · src/a.ts:12")).toBeInTheDocument();
    expect(heading()).toHaveTextContent(/^Eval cases$/);
  });

  it("AC-2 and AC-7: Run all evals then New eval case after the heading; no 'Run eval (' text; row actions are icon-only", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": CASES, "GET /agents/ag1/eval-runs": [] });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    const runAll = await screen.findByRole("button", { name: "Run all evals" });
    const add = screen.getByRole("button", { name: "New eval case" });
    expect(heading().compareDocumentPosition(runAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(runAll.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Run eval \(/)).toBeNull();
    await screen.findByRole("button", { name: /^Run eval case “src\/a.ts:12/ });
    for (const name of [/^Run eval case “src\/a.ts:12/, /^Edit eval case “src\/a.ts:12/, /^Delete eval case “src\/a.ts:12/]) {
      expect(screen.getByRole("button", { name }).textContent).toBe("");
    }
    await waitFor(() => expect(runAll).toBeEnabled());
    fireEvent.click(runAll);
    expect(screen.getByText("Run 2 eval cases?")).toBeInTheDocument();
  });

  it("AC-3 to AC-6: icon per status, expected/got, never run, errored with tooltip, severity and assert empty", async () => {
    const cases = [
      evalCase("p", "must_find", "src/a.ts", 12),
      evalCase("f", "must_not_flag", "src/b.ts", 7),
      evalCase("e", "must_find", "src/c.ts", 3),
      evalCase("n", "must_find", "src/d.ts", 4),
    ];
    cases[0]!.expected_output.severity = "critical";
    cases[3]!.expected_output.severity = "";
    mockFetch({
      "GET /agents/ag1/eval-cases": cases,
      "GET /agents/ag1/eval-runs": [suite("r1", "done", "2026-10-12T10:00:00Z")],
      "GET /eval-runs/r1": detail("r1", "done", "2026-10-12T10:00:00Z", [
        record("p", "passed", [kept("src/a.ts", 12), kept("src/other.ts", 12)]),
        record("f", "failed", [kept("src/b.ts", 7), kept("src/b.ts", 7)]),
        record("e", "error", [], "model timed out"),
      ]),
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(await screen.findByText("expected 1 finding, got 1 · src/a.ts:12")).toBeInTheDocument();
    expect(screen.getByText("expected 0 findings, got 2 · src/b.ts:7")).toBeInTheDocument();
    expect(screen.getByText("never run · src/d.ts:4")).toBeInTheDocument();
    expect(screen.getByText("errored · src/c.ts:3")).toHaveAttribute("title", "model timed out");

    const icons = ["Passed", "Failed", "Errored", "Never run"].map((name) => screen.getByRole("img", { name }));
    const shapes = icons.map((el) => el.querySelector("svg")!);
    expect(shapes.every((svg) => svg.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(new Set(shapes.map((svg) => svg.getAttribute("class"))).size).toBe(4);

    expect(screen.getByText("CRITICAL · security")).toBeInTheDocument();
    expect(screen.getByText("assert empty")).toBeInTheDocument();
    expect(screen.getAllByText("security")).toHaveLength(1); // the case without a severity: category only
  });

  it("AC-8: a tracked suite finishing refreshes the heading and the icons; a row Run changes neither", async () => {
    const cases = many(2);
    let polls = 0;
    mockFetch({
      "GET /agents/ag1/eval-cases": cases,
      "GET /agents/ag1/eval-runs": () =>
        polls > 1
          ? [suite("r2", "done", "2026-10-12T11:00:00Z"), suite("r1", "done", "2026-10-12T10:00:00Z")]
          : [suite("r2", "running", "2026-10-12T11:00:00Z"), suite("r1", "done", "2026-10-12T10:00:00Z")],
      "GET /eval-runs/r1": detail("r1", "done", "2026-10-12T10:00:00Z", [record("k0", "passed", [kept("src/a.ts", 1)]), record("k1", "failed")]),
      "GET /eval-runs/r2": () => {
        polls += 1;
        return detail("r2", polls > 1 ? "done" : "running", "2026-10-12T11:00:00Z", [
          record("k0", "passed", [kept("src/a.ts", 1)]),
          record("k1", "passed", [kept("src/a.ts", 2)]),
        ]);
      },
      "POST /eval-cases/k0/run": { outcome: "failed", pass: false, expectation_kind: "must_find", matched: false, matched_count: 0, findings_kept: 0, findings_dropped: 0, kept: [], dropped: [], duration_ms: 1, cost_usd: 0, agent_version: 1, skill_version: null, error: null },
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    await waitFor(() => expect(heading()).toHaveTextContent("Eval cases · 1/2 passing"));
    expect(screen.getAllByRole("img", { name: "Passed" })).toHaveLength(1);

    // a per-case Run shows its result inline and leaves the heading and icons alone
    fireEvent.click(screen.getByRole("button", { name: /^Run eval case “src\/a.ts:1 title k0/ }));
    await screen.findByText("Failed", { selector: "strong" });
    expect(heading()).toHaveTextContent("Eval cases · 1/2 passing");
    expect(screen.getAllByRole("img", { name: "Passed" })).toHaveLength(1);

    await waitFor(() => expect(heading()).toHaveTextContent("Eval cases · 2/2 passing"), { timeout: 5000 });
    expect(screen.getAllByRole("img", { name: "Passed" })).toHaveLength(2);
  }, 10000);

  it("AC-9: a failing suite detail keeps every row, drops the icons and the count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, "");
        if (path === "/agents/ag1/eval-cases") return new Response(JSON.stringify(CASES), { status: 200 });
        if (path === "/agents/ag1/eval-runs") return new Response(JSON.stringify([suite("r1", "done", "2026-10-12T10:00:00Z")]), { status: 200 });
        return new Response(JSON.stringify({ error: { code: "internal_error", message: "x" } }), { status: 500 });
      }),
    );
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(await screen.findByText("src/a.ts:12")).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]).endsWith("/eval-runs/r1"))).toBe(true));
    for (const name of ["Passed", "Failed", "Errored", "Never run"]) expect(screen.queryByRole("img", { name })).toBeNull();
    expect(screen.getByLabelText("Positive case · must find")).toBeInTheDocument();
    expect(screen.getByText("WARNING · security")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Run eval case “src\/a.ts:12/ })).toBeInTheDocument();
    expect(heading()).toHaveTextContent(/^Eval cases$/);
  });

  it("NFR-2: 100 cases render as 100 rows with exactly one extra request, for the reference suite", async () => {
    const cases = many(100);
    const calls = mockFetch({
      "GET /agents/ag1/eval-cases": cases,
      "GET /agents/ag1/eval-runs": [suite("r1", "done", "2026-10-12T10:00:00Z")],
      "GET /eval-runs/r1": detail("r1", "done", "2026-10-12T10:00:00Z", cases.map((c) => record(c.id, "passed", [kept("src/a.ts", 1)]))),
    });
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    await waitFor(() => expect(heading()).toHaveTextContent("Eval cases · 100/100 passing"));
    expect(screen.getAllByRole("listitem")).toHaveLength(100);
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([
      "GET /agents/ag1/eval-cases",
      "GET /agents/ag1/eval-runs",
      "GET /eval-runs/r1",
    ]);
  });

  it("AC-10: the same fixture under an agent owner and a skill owner reads identically, from each owner's routes", async () => {
    const cases = [evalCase("p", "must_find", "src/a.ts", 12), evalCase("n", "must_not_flag", "src/b.ts", 7)];
    const recs = [record("p", "passed", [kept("src/a.ts", 12)])];
    const render = async (ownerProps: { agentId: string } | { owner: { kind: "skill"; id: string } }, prefix: string) => {
      const calls = mockFetch({
        [`GET ${prefix}/eval-cases`]: cases,
        [`GET ${prefix}/eval-runs`]: [suite("r1", "done", "2026-10-12T10:00:00Z")],
        "GET /eval-runs/r1": detail("r1", "done", "2026-10-12T10:00:00Z", recs),
      });
      const view = renderWithProviders(<EvalCasesList {...ownerProps} />);
      await waitFor(() => expect(heading()).toHaveTextContent("Eval cases · 1/2 passing"));
      const text = screen.getAllByRole("listitem").map((li) => li.textContent);
      const icons = screen.getAllByRole("img").map((el) => el.getAttribute("aria-label"));
      const paths = calls.map((c) => c.path).filter((p) => p !== "/eval-runs/r1");
      view.unmount();
      return { text, icons, paths };
    };
    const agent = await render({ agentId: "ag1" }, "/agents/ag1");
    const skill = await render({ owner: { kind: "skill", id: "s1" } }, "/skills/s1");
    expect(skill.text).toEqual(agent.text);
    expect(skill.icons).toEqual(agent.icons);
    expect(agent.paths.sort()).toEqual(["/agents/ag1/eval-cases", "/agents/ag1/eval-runs"]);
    expect(skill.paths.sort()).toEqual(["/skills/s1/eval-cases", "/skills/s1/eval-runs"]);
  });
});
