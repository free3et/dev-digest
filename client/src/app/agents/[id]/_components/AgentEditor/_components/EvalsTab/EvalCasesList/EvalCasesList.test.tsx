import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockFetch, renderWithProviders } from "@/test/render";
import messages from "../../../../../../../../../messages/en/eval.json";
import { EvalCasesList } from "./EvalCasesList";

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
    expect(await screen.findByText("Positive")).toBeInTheDocument();
    expect(screen.getByText("Negative")).toBeInTheDocument();
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
    expect(screen.getByText("Positive").style.textTransform).toBe("uppercase");
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
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument();
  });

  it("offers Retry when the list fails to load", async () => {
    mockFetch({});
    renderWithProviders(<EvalCasesList agentId="ag1" />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
