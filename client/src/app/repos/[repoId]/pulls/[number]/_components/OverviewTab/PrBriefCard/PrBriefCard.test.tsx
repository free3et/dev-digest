import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PrBrief } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { PrBriefCard } from "./PrBriefCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BRIEF: PrBrief = {
  summary: "Adds retry logic to the payment client.",
  risks: {
    risks: [
      { kind: "behavior", title: "Double charge on retry", explanation: "Retry may repeat <script>alert(1)</script>", severity: "high", file_refs: ["src/pay.ts"] },
      { kind: "perf", title: "Slow path", explanation: "Extra loop.", severity: "low", file_refs: ["src/loop.ts"] },
      { kind: "data", title: "Schema drift", explanation: "Column added.", severity: "medium", file_refs: ["db/schema.ts"] },
    ],
  },
  review_focus: [
    { file: "src/pay.ts", line: 42, reason: "Core retry loop" },
    { file: "src/other.ts", line: null, reason: "Wiring" },
  ],
  intent: null,
  blast: null,
  head_sha: "abc",
  generated_at: "2026-10-07T00:00:00Z",
  model: "gpt-x",
  cost_usd: 0.0123,
  missing_inputs: ["blast", "linked_issue"],
  intent_stale: false,
  truncated_inputs: [],
};

const GET = "GET /pulls/p1/brief";
const POST = "POST /pulls/p1/brief";

describe("PrBriefCard", () => {
  it("empty state offers Generate, which POSTs and shows the brief", async () => {
    const calls = mockFetch({ [GET]: { brief: null, stale: false }, [POST]: BRIEF });
    renderWithProviders(<PrBriefCard prId="p1" />);
    expect(await screen.findByText("Brief not available yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(await screen.findByText(BRIEF.summary)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("while generating the button is disabled and the card is aria-busy", async () => {
    let release: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "POST"
          ? new Promise<Response>((res) => (release = res))
          : Promise.resolve(new Response(JSON.stringify({ brief: null, stale: false }), { status: 200 })),
      ),
    );
    const { container } = renderWithProviders(<PrBriefCard prId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    const btn = await screen.findByRole("button", { name: "Generating brief…" });
    expect(btn).toBeDisabled();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    release(new Response(JSON.stringify(BRIEF), { status: 200 }));
    expect(await screen.findByText(BRIEF.summary)).toBeInTheDocument();
  });

  it("renders summary, Merge risks, Review focus in order with labelled pills", async () => {
    mockFetch({ [GET]: { brief: BRIEF, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    const heads = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(heads).toEqual(["Summary", "Merge risks", "Review focus"]);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders model text as plain text", async () => {
    mockFetch({ [GET]: { brief: BRIEF, stale: false } });
    const { container } = renderWithProviders(<PrBriefCard prId="p1" />);
    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("clicking a focus item calls onOpenFile with path and line, null when no line", async () => {
    mockFetch({ [GET]: { brief: BRIEF, stale: false } });
    const onOpenFile = vi.fn();
    renderWithProviders(<PrBriefCard prId="p1" onOpenFile={onOpenFile} />);
    await screen.findByText(BRIEF.summary);
    fireEvent.click(screen.getByRole("button", { name: "Open src/pay.ts:42 in the diff" }));
    fireEvent.click(screen.getByRole("button", { name: "Open src/other.ts in the diff" }));
    expect(onOpenFile).toHaveBeenNthCalledWith(1, "src/pay.ts", 42);
    expect(onOpenFile).toHaveBeenNthCalledWith(2, "src/other.ts", null);
    expect(screen.getByText("src/other.ts")).toBeInTheDocument();
  });

  it("focus items are native buttons", async () => {
    mockFetch({ [GET]: { brief: BRIEF, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    const btn = screen.getByRole("button", { name: /src\/pay\.ts:42/ });
    expect(btn.tagName).toBe("BUTTON");
  });

  it("shows missing inputs and the intent_stale reason in the muted line", async () => {
    mockFetch({ [GET]: { brief: { ...BRIEF, intent_stale: true }, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    expect(
      await screen.findByText("Generated without: blast radius, linked issue, up-to-date intent"),
    ).toBeInTheDocument();
  });

  it("omits the muted line when nothing is missing", async () => {
    mockFetch({ [GET]: { brief: { ...BRIEF, missing_inputs: [] }, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    expect(screen.queryByText(/Generated without/)).toBeNull();
  });

  it("footer shows model and cost, and a dash when cost is null", async () => {
    mockFetch({ [GET]: { brief: { ...BRIEF, cost_usd: null }, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    expect(await screen.findByText("Generated by gpt-x")).toBeInTheDocument();
    expect(screen.getByText("Cost —")).toBeInTheDocument();
  });

  it("long titles and paths ellipsize", async () => {
    const long = "a/".repeat(60) + "file.ts";
    const brief = {
      ...BRIEF,
      risks: { risks: [{ ...BRIEF.risks.risks[0]!, title: "T".repeat(200), file_refs: [long] }] },
      review_focus: [{ file: long, line: 3, reason: "r" }],
    };
    mockFetch({ [GET]: { brief, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    const title = screen.getByText("T".repeat(200));
    expect(title.style.textOverflow).toBe("ellipsis");
    for (const el of [screen.getByText(long), screen.getByText(`${long}:3`)]) {
      expect(el.style.textOverflow).toBe("ellipsis");
    }
  });

  it("Refresh on a fresh brief asks to confirm; Cancel sends no POST", async () => {
    const calls = mockFetch({ [GET]: { brief: BRIEF, stale: false }, [POST]: BRIEF });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("confirming Refresh POSTs once", async () => {
    const calls = mockFetch({ [GET]: { brief: BRIEF, stale: false }, [POST]: BRIEF });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
  });

  it("stale brief shows the notice and Refresh regenerates without a dialog", async () => {
    const calls = mockFetch({ [GET]: { brief: BRIEF, stale: true }, [POST]: BRIEF });
    renderWithProviders(<PrBriefCard prId="p1" />);
    expect(await screen.findByText(/earlier commit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
  });

  it("a 409 shows an inline error with Retry and keeps the earlier brief", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "POST"
          ? new Response(JSON.stringify({ error: { code: "brief_unavailable", message: "no" } }), { status: 409 })
          : new Response(JSON.stringify({ brief: BRIEF, stale: true }), { status: 200 }),
      ),
    );
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't generate the brief");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
  });

  it("empty state explains how to start (hint copy) and offers only Generate", async () => {
    mockFetch({ [GET]: { brief: null, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    expect(
      await screen.findByText("Generate a brief to get a summary, merge risks and where to look first."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
  });

  it("each risk row shows its severity pill and file; the focus row shows file:line and reason", async () => {
    mockFetch({ [GET]: { brief: BRIEF, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    const row = (title: string) =>
      screen.getAllByRole("listitem").find((li) => within(li).queryByText(title) !== null)!;

    const high = row("Double charge on retry");
    expect(within(high).getByText("High")).toBeInTheDocument();
    expect(within(high).getByText("src/pay.ts")).toBeInTheDocument();
    const medium = row("Schema drift");
    expect(within(medium).getByText("Medium")).toBeInTheDocument();
    expect(within(medium).getByText("db/schema.ts")).toBeInTheDocument();
    expect(within(row("Slow path")).getByText("Low")).toBeInTheDocument();

    const focus = screen.getByRole("button", { name: "Open src/pay.ts:42 in the diff" });
    expect(within(focus).getByText("src/pay.ts:42")).toBeInTheDocument();
    expect(within(focus).getByText("Core retry loop")).toBeInTheDocument();
  });

  it("empty risks and focus lists show their empty lines instead of rows (EC-2)", async () => {
    mockFetch({ [GET]: { brief: { ...BRIEF, risks: { risks: [] }, review_focus: [] }, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    expect(await screen.findByText("No merge risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("Nothing specific to look at first.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /in the diff/ })).toBeNull();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Summary", "Merge risks", "Review focus"]);
  });

  it("focus items are focusable native buttons and a fresh brief has no stale notice", async () => {
    mockFetch({ [GET]: { brief: BRIEF, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    const btn = screen.getByRole("button", { name: "Open src/pay.ts:42 in the diff" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).not.toHaveAttribute("tabindex", "-1");
    btn.focus();
    expect(btn).toHaveFocus();
    expect(screen.queryByText(/earlier commit/)).toBeNull();
  });

  it("footer shows the formatted cost when the model is priced", async () => {
    mockFetch({ [GET]: { brief: BRIEF, stale: false } });
    renderWithProviders(<PrBriefCard prId="p1" />);
    expect(await screen.findByText("Generated by gpt-x")).toBeInTheDocument();
    expect(screen.getByText("Cost $0.0123")).toBeInTheDocument();
  });

  it("a failed first Generate shows the error and Retry; Retry POSTs again and the brief replaces the error", async () => {
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") !== "POST") {
          return new Response(JSON.stringify({ brief: null, stale: false }), { status: 200 });
        }
        posts += 1;
        return posts === 1
          ? new Response(JSON.stringify({ error: { code: "brief_unavailable", message: "no" } }), { status: 409 })
          : new Response(JSON.stringify(BRIEF), { status: 200 });
      }),
    );
    renderWithProviders(<PrBriefCard prId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't generate the brief");
    expect(screen.queryByText(BRIEF.summary)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(BRIEF.summary)).toBeInTheDocument();
    expect(posts).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("while a Refresh runs the old brief stays visible and the button is disabled", async () => {
    let release: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "POST"
          ? new Promise<Response>((res) => (release = res))
          : Promise.resolve(new Response(JSON.stringify({ brief: BRIEF, stale: true }), { status: 200 })),
      ),
    );
    renderWithProviders(<PrBriefCard prId="p1" />);
    await screen.findByText(BRIEF.summary);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("button", { name: "Generating brief…" })).toBeDisabled();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    release(new Response(JSON.stringify({ ...BRIEF, summary: "Fresh summary." }), { status: 200 }));
    expect(await screen.findByText("Fresh summary.")).toBeInTheDocument();
    expect(screen.queryByText(/earlier commit/)).toBeNull();
  });
});
