import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import type { EvalDashboardRow, EvalSuiteRun } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../../../messages/en/eval.json";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

function latest(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "s",
    agent_id: "a",
    agent_version: 7,
    owner_kind: "agent",
    skill_id: null,
    skill_version: null,
    status: "done",
    ran_at: "2026-05-29T09:14:00.000Z",
    finished_at: "2026-05-29T09:15:00.000Z",
    case_ids: [],
    skills: [],
    cases_total: 20,
    cases_completed: 20,
    cases_passed: 17,
    cases_errored: 0,
    recall: 0.82,
    precision: 0.5,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    error: null,
    ...over,
  };
}

function row(over: Partial<EvalDashboardRow> = {}): EvalDashboardRow {
  return {
    agent_id: "z1",
    agent_name: "Zed",
    cases_total: 20,
    latest: latest(),
    running: false,
    delta: { recall: 0.04, precision: -0.25, citation_accuracy: null },
    drop: false,
    ...over,
  };
}

function renderCard(r: EvalDashboardRow, recallPoints?: number[]) {
  renderWithProviders(
    <ul>
      <AgentCard row={r} recallPoints={recallPoints} />
    </ul>,
  );
  return screen.getByRole("listitem");
}

describe("AgentCard", () => {
  it("shows the full name as plain text with a title, a decorative icon and no model chip (AC-3, AC-9)", () => {
    const name = "<script>alert(1)</script>";
    const card = renderCard(row({ agent_name: name }));
    const el = within(card).getByText(name);
    expect(el).toHaveAttribute("title", name);
    expect(document.querySelector("script")).toBeNull();
    expect(card.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(card.textContent).not.toMatch(/gpt|claude|model/i);
    expect(el.style.flexGrow).toBe("1");
    expect(el.style.minWidth).toBe("0");
    expect(el.style.whiteSpace).toBe("nowrap");
    expect(el.style.textOverflow).toBe("ellipsis");
  });

  it("shows a pill with a tooltip per state, partial only for a partial run (AC-4)", () => {
    const card = renderCard(row({ drop: true, running: true, latest: latest({ status: "partial" }) }));
    expect(within(card).getByText("drop")).toHaveAttribute("title", "Recall or precision fell against the previous finished run");
    expect(within(card).getByText("running")).toHaveAttribute("title", "An eval run was in progress when this page loaded");
    expect(within(card).getByText("partial")).toHaveAttribute("title", "The latest run finished with errored cases");
    cleanup();
    const plain = renderCard(row());
    expect(within(plain).queryByText("drop")).toBeNull();
    expect(within(plain).queryByText("running")).toBeNull();
    expect(within(plain).queryByText("partial")).toBeNull();
  });

  it("reads the last run in local time with a UTC tooltip (AC-5)", () => {
    const card = renderCard(row());
    expect(card.textContent).toContain("Last run v7 · 2026-05-29 09:14 · 17/20 pass");
    expect(card.textContent).not.toContain("UTC");
    expect(screen.getByTitle("2026-05-29 09:14 UTC")).toBeInTheDocument();
  });

  it("never run: count with plural, three dashes, no delta (AC-6)", () => {
    const base = { latest: null, delta: { recall: null, precision: null, citation_accuracy: null } };
    let card = renderCard(row({ ...base, cases_total: 1 }));
    expect(card.textContent).toContain("Never run · 1 case");
    expect(card.textContent).not.toContain("1 cases");
    expect(within(card).getAllByText("—")).toHaveLength(3);
    expect(within(card).queryAllByRole("img")).toHaveLength(0);
    cleanup();
    card = renderCard(row({ ...base, cases_total: 5 }));
    expect(card.textContent).toContain("Never run · 5 cases");
  });

  it("shows big metric values, point deltas and captioned names (AC-7)", () => {
    const card = renderCard(row());
    expect(within(card).getByText("82%")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "up 4 pt" })).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "down 25 pt" })).toBeInTheDocument();
    expect(within(card).getByTitle("Precision")).toBeInTheDocument();
    expect(within(card).getByTitle("Citation accuracy")).toBeInTheDocument();
    expect(within(card).getByText("Prec").parentElement!.style.textTransform).toBe("uppercase");
    expect(within(card).getByText("82%").parentElement!.style.fontSize).toBe("22px");
    // null citation value: dash, no delta
    expect(within(card).getAllByText("—")).toHaveLength(1);
    expect(card.textContent).not.toMatch(/[()]/);
    cleanup();
    // null delta on a present value: dash on the delta line
    const c2 = renderCard(row({ delta: { recall: null, precision: 0, citation_accuracy: null } }));
    expect(within(c2).getByRole("img", { name: "unchanged" })).toBeInTheDocument();
    expect(within(c2).getAllByText("—").length).toBe(2);
  });

  it("has exactly one link, the chevron to the eval page, named for the agent (Spec F AC-23)", () => {
    const card = renderCard(row());
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/eval/z1");
    expect(links[0]).toHaveAccessibleName("Open eval page of Zed");
    expect(card.querySelector('a[href*="tab=evals"]')).toBeNull();
    expect(within(card).queryByText("Open Evals tab")).toBeNull();
  });

  it("shows a recall sparkline left of the metric blocks with two or more points and keeps one link (AC-26)", () => {
    const card = renderCard(row(), [0.7, 0.75, 0.82]);
    const spark = within(card).getByRole("img", { name: "Recall trend over 3 runs: from 70% to 82%" });
    expect(within(card).getAllByRole("link")).toHaveLength(1);
    expect(spark.querySelector("polyline")).toHaveAttribute("stroke", "var(--accent)");
    // sparkline sits between the left column and the metric blocks
    const children = Array.from(card.children);
    const sparkIdx = children.findIndex((c) => c.contains(spark));
    expect(sparkIdx).toBe(1);
    expect(children).toHaveLength(4);
  });

  it("shows no sparkline with one point, no points or while the series is unavailable (AC-27)", () => {
    for (const points of [[0.7], [], undefined]) {
      const card = renderCard(row(), points);
      expect(within(card).queryByRole("img", { name: /trend over/ })).toBeNull();
      expect(card.children).toHaveLength(3);
      cleanup();
    }
  });

  it("keeps card captions in sentence case in i18n (AC-13)", () => {
    for (const k of ["recall", "precision", "citation"] as const) {
      expect(messages.dashboard.card.metric[k]).toMatch(/[a-z]/);
    }
    expect(messages.dashboard.agents.title).toMatch(/[a-z]/);
  });
});
