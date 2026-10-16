import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";
import { mockFetch, renderWithProviders } from "@/test/render";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard eval control", () => {
  const ACCEPTED = { ...FINDING, accepted_at: "2026-10-12T10:00:00Z" };

  it("renders only for a decided finding with an agent and an onAction", async () => {
    mockFetch({ "GET /agents/ag1/eval-cases": [] });
    const { unmount } = renderWithProviders(
      <FindingCard f={ACCEPTED} defaultExpanded onAction={() => {}} agentId="ag1" />,
    );
    expect(await screen.findByRole("button", { name: /eval case: must find/i })).toBeInTheDocument();
    unmount();

    // undecided
    renderWithProviders(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} agentId="ag1" />);
    expect(screen.queryByRole("button", { name: /eval case/i })).toBeNull();
    cleanup();

    // no agent
    renderWithProviders(<FindingCard f={ACCEPTED} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: /eval case/i })).toBeNull();
    cleanup();

    // read-only (no onAction)
    renderWithProviders(<FindingCard f={ACCEPTED} defaultExpanded agentId="ag1" />);
    expect(screen.queryByRole("button", { name: /eval case/i })).toBeNull();
  });
});
