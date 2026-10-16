import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { EvalCaseDraft, EvalDryRunResult } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { EvalCaseModal } from "./EvalCaseModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT: EvalCaseDraft = {
  finding_id: "f1",
  agent_id: "ag1",
  name: "src/config.ts:11 Hardcoded key",
  input_diff: "@@ -10,3 +10,4 @@\n+  const key = 'sk_live_x';",
  input_files: ["src/config.ts"],
  input_meta: { pr_number: 42, pr_title: "Add Stripe", pr_body: "Wires payments <script>alert(1)</script>", repo: "acme/pay" },
  expected_output: {
    kind: "must_find",
    file: "src/config.ts",
    start_line: 11,
    end_line: 12,
    title: "Hardcoded key",
    severity: "CRITICAL",
    category: "security",
  },
};

const NEGATIVE: EvalCaseDraft = {
  ...DRAFT,
  input_meta: { ...DRAFT.input_meta, pr_body: null },
  expected_output: { ...DRAFT.expected_output, kind: "must_not_flag" },
};

const RESULT: EvalDryRunResult = {
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
  error: null,
};

type Reply = { status?: number; body?: unknown } | "network" | Promise<{ status?: number; body?: unknown }>;
interface Seen {
  method: string;
  path: string;
  body: unknown;
}

/** Stubs fetch by hand (mockFetch answers only 200/404). Returns the request log. */
function stubApi(routes: Record<string, Reply | (() => Reply)>) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const method = (init?.method ?? "GET").toUpperCase();
      seen.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const entry = routes[`${method} ${path}`];
      const reply = typeof entry === "function" ? entry() : entry;
      if (reply === undefined) return new Response("{}", { status: 404 });
      if (reply === "network") throw new TypeError("fetch failed");
      const r = await reply;
      const status = r.status ?? 200;
      return new Response(JSON.stringify(status >= 400 ? { error: r.body } : r.body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return seen;
}

const DRAFT_ROUTE = "GET /findings/f1/eval-case/draft";
const DRY_ROUTE = "POST /findings/f1/eval-case/dry-run";
const SAVE_ROUTE = "POST /findings/f1/eval-case";

function renderModal(over: { onClose?: () => void; onSaved?: () => void } = {}) {
  const onClose = over.onClose ?? vi.fn();
  const onSaved = over.onSaved ?? vi.fn();
  renderWithProviders(<EvalCaseModal findingId="f1" agentId="ag1" onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

const json = () => screen.getByRole("textbox", { name: "Expected output" }) as HTMLTextAreaElement;
const nameField = () => screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
const runBtn = () => screen.getByRole("button", { name: /Run case|Running/ });
const saveBtn = () => screen.getByRole("button", { name: /^Save$|^Saving/ });

async function open(draft: EvalCaseDraft = DRAFT, extra: Record<string, Reply | (() => Reply)> = {}) {
  const seen = stubApi({ [DRAFT_ROUTE]: { body: draft }, ...extra });
  const handlers = renderModal();
  await screen.findByRole("textbox", { name: "Name" });
  return { seen, ...handlers };
}

function setJson(over: Record<string, unknown>) {
  fireEvent.change(json(), { target: { value: JSON.stringify({ ...DRAFT.expected_output, ...over }) } });
}

describe("EvalCaseModal — review", () => {
  it("shows the draft: title, subtitle, banner, name, read-only input tabs, JSON", async () => {
    await open();
    const dialog = screen.getByRole("dialog", { name: "Eval case · src/config.ts:11 Hardcoded key" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Seeded from an accepted finding · assert the expected output")).toBeInTheDocument();
    expect(screen.getByText("POSITIVE CASE · MUST find Hardcoded key at src/config.ts:11")).toBeInTheDocument();
    expect(nameField()).toHaveValue(DRAFT.name);
    expect(nameField()).toBeRequired();
    expect(nameField()).toHaveFocus();
    expect(JSON.parse(json().value)).toEqual(DRAFT.expected_output);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByText("Runs the agent once (one paid model call)")).toBeInTheDocument();

    // Diff tab (default): plain text, nothing editable inside the tab panel.
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("const key = 'sk_live_x';");
    expect(within(panel).queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("src/config.ts");
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "PR meta" }));
    const meta = screen.getByRole("tabpanel");
    expect(meta).toHaveTextContent("#42");
    expect(meta).toHaveTextContent("Add Stripe");
    expect(meta).toHaveTextContent("acme/pay");
    // The <script> body is text, not markup.
    expect(meta).toHaveTextContent("Wires payments <script>alert(1)</script>");
    expect(meta.querySelector("script")).toBeNull();
    expect(within(meta).queryByRole("textbox")).toBeNull();
  });

  it("names the negative case and its dismissed subtitle, and 'no body' for a null body", async () => {
    await open(NEGATIVE);
    expect(screen.getByText("NEGATIVE CASE · MUST NOT flag Hardcoded key at src/config.ts:11")).toBeInTheDocument();
    expect(screen.getByText("Seeded from a dismissed finding · assert the expected output")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "PR meta" }));
    expect(screen.getByText("no body")).toBeInTheDocument();
  });

  it("explains a refused draft and keeps only Cancel usable", async () => {
    stubApi({ [DRAFT_ROUTE]: { status: 409, body: { code: "patch_unavailable", message: "m" } } });
    const { onClose } = renderModal();
    expect(await screen.findByRole("alert")).toHaveTextContent(/patch_unavailable/);
    expect(runBtn()).toBeDisabled();
    expect(saveBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("explains a network failure of the draft request", async () => {
    stubApi({ [DRAFT_ROUTE]: "network" });
    renderModal();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not reach the server/);
    expect(runBtn()).toBeDisabled();
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});

describe("EvalCaseModal — editing", () => {
  it("flags each invalid expectation with a reason, blocks Run and Save, and the skeleton resets", async () => {
    await open();
    const cases: Array<[string, RegExp]> = [
      ["{ nope", /not valid JSON/],
      [JSON.stringify({ ...DRAFT.expected_output, end_line: 3 }), /end_line must be greater/],
      [JSON.stringify({ ...DRAFT.expected_output, file: "src/other.ts" }), /file must be src\/config\.ts/],
      [JSON.stringify({ ...DRAFT.expected_output, kind: "must_not_flag" }), /kind must stay must_find/],
      [JSON.stringify({ ...DRAFT.expected_output, source: { finding_id: "x" } }), /Unknown key not allowed: source/],
    ];
    for (const [text, reason] of cases) {
      fireEvent.change(json(), { target: { value: text } });
      expect(screen.getByText("invalid JSON")).toBeInTheDocument();
      expect(screen.getByText(reason)).toBeInTheDocument();
      expect(runBtn()).toBeDisabled();
      expect(saveBtn()).toBeDisabled();
      expect(screen.getByText(/Save is disabled: the expected output is not valid JSON/)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Finding skeleton" }));
    expect(JSON.parse(json().value)).toEqual(DRAFT.expected_output);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(runBtn()).toBeEnabled();
  });

  it("blocks Save on an empty or whitespace name, allows it with a valid name and no prior run", async () => {
    await open();
    expect(saveBtn()).toBeEnabled();
    fireEvent.change(nameField(), { target: { value: "" } });
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByText(/Save is disabled: the name is empty/)).toBeInTheDocument();
    fireEvent.change(nameField(), { target: { value: "   " } });
    expect(saveBtn()).toBeDisabled();
    fireEvent.change(nameField(), { target: { value: "my case" } });
    expect(saveBtn()).toBeEnabled();
  });
});

describe("EvalCaseModal — run case", () => {
  it("sends one dry-run for two quick clicks, shows Running… until it resolves, then the result", async () => {
    let release: (r: { body: unknown }) => void = () => {};
    const pending = new Promise<{ body: unknown }>((res) => {
      release = res;
    });
    const { seen } = await open(DRAFT, { [DRY_ROUTE]: pending });
    setJson({ start_line: 11, end_line: 11 });

    fireEvent.click(runBtn());
    fireEvent.click(runBtn());
    await waitFor(() => expect(runBtn()).toBeDisabled());
    expect(runBtn()).toHaveTextContent("Running…");

    release({ body: RESULT });
    expect(await screen.findByText("Last run passed")).toBeInTheDocument();
    expect(screen.getByText("expected ≥ 1 matching finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("2 kept")).toBeInTheDocument();
    expect(screen.getByText("1 dropped")).toBeInTheDocument();
    expect(screen.getByText("1.8s")).toBeInTheDocument();
    expect(screen.getByText("$0.02")).toBeInTheDocument();
    expect(runBtn()).toBeEnabled();

    const posts = seen.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      path: "/findings/f1/eval-case/dry-run",
      body: { expected_output: { ...DRAFT.expected_output, start_line: 11, end_line: 11 } },
    });
  });

  it("shows a failed, then an errored run (plain error text, no cost), replacing the older result", async () => {
    const replies: Reply[] = [
      { body: { ...RESULT, outcome: "failed", pass: false, matched: false, matched_count: 0 } },
      {
        body: {
          ...RESULT,
          outcome: "error",
          pass: null,
          matched: null,
          matched_count: null,
          findings_kept: null,
          findings_dropped: null,
          cost_usd: null,
          error: "timed out <b>after</b> 60 s",
        },
      },
    ];
    await open(DRAFT, { [DRY_ROUTE]: () => replies.shift() as Reply });

    fireEvent.click(runBtn());
    expect(await screen.findByText("Last run failed")).toBeInTheDocument();
    expect(screen.getByText("expected ≥ 1 matching finding, got 0")).toBeInTheDocument();

    fireEvent.click(runBtn());
    expect(await screen.findByText("Last run errored")).toBeInTheDocument();
    expect(screen.queryByText("Last run failed")).toBeNull();
    expect(screen.getByText("timed out <b>after</b> 60 s")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("states the expectation for a must_not_flag case", async () => {
    await open(NEGATIVE, {
      [DRY_ROUTE]: { body: { ...RESULT, expectation_kind: "must_not_flag", matched_count: 2, pass: false, outcome: "failed" } },
    });
    fireEvent.click(runBtn());
    expect(await screen.findByText("expected 0 matching findings, got 2")).toBeInTheDocument();
  });

  it("shows a rate-limited dry-run in the result area and re-enables Run", async () => {
    await open(DRAFT, { [DRY_ROUTE]: { status: 429, body: { code: "rate_limited", message: "m" } } });
    fireEvent.click(runBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Too many requests/);
    expect(runBtn()).toBeEnabled();
  });
});

describe("EvalCaseModal — save", () => {
  it("sends exactly the trimmed name and the parsed expectation, then reports saved", async () => {
    const { seen, onSaved } = await open(DRAFT, { [SAVE_ROUTE]: { status: 201, body: { id: "c1" } } });
    fireEvent.change(nameField(), { target: { value: "  my case  " } });
    setJson({ start_line: 11, end_line: 11 });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const post = seen.find((c) => c.method === "POST");
    expect(post?.path).toBe("/findings/f1/eval-case");
    expect(post?.body).toEqual({
      name: "my case",
      expected_output: { ...DRAFT.expected_output, start_line: 11, end_line: 11 },
    });
  });

  it("saves while a dry-run is still in flight", async () => {
    const never = new Promise<{ body: unknown }>(() => {});
    const { seen, onSaved } = await open(DRAFT, {
      [DRY_ROUTE]: never,
      [SAVE_ROUTE]: { status: 201, body: { id: "c1" } },
    });
    fireEvent.click(runBtn());
    await waitFor(() => expect(runBtn()).toBeDisabled());
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(seen.filter((c) => c.path === "/findings/f1/eval-case")).toHaveLength(1);
  });

  it("keeps the dialog and the edits, names the reason and re-enables Save on a refusal", async () => {
    const { onSaved } = await open(DRAFT, {
      [SAVE_ROUTE]: { status: 422, body: { code: "kind_mismatch", message: "m" } },
    });
    fireEvent.change(nameField(), { target: { value: "edited" } });
    fireEvent.click(saveBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Close and reopen the modal/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(nameField()).toHaveValue("edited");
    expect(saveBtn()).toBeEnabled();
  });

  it("names a duplicate and a network failure of the save", async () => {
    const replies: Reply[] = [{ status: 409, body: { code: "duplicate", message: "m" } }, "network"];
    await open(DRAFT, { [SAVE_ROUTE]: () => replies.shift() as Reply });
    fireEvent.click(saveBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/already has an eval case/);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Could not reach the server/));
  });
});

describe("EvalCaseModal — dialog behaviour", () => {
  it("closes on Escape, the X button and the backdrop", async () => {
    const { onClose } = await open();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("wraps Tab from the last control to the first and Shift+Tab back", async () => {
    await open();
    const close = screen.getByRole("button", { name: "Close" });
    const save = saveBtn();
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(save).toHaveFocus();
  });
});
