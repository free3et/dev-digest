import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { ConventionCandidate } from "@devdigest/shared";
import { renderWithProviders, userEvent } from "@/test/render";
import { ConventionCard } from "./ConventionCard";

afterEach(() => {
  cleanup();
});

const CAND: ConventionCandidate = {
  id: "c1",
  rule: "Throw AppError, never bare Error",
  evidence_path: "src/errors.ts",
  evidence_snippet: "throw new AppError(\"bad\", 400);",
  evidence_line: 12,
  category: "errors",
  confidence: 0.8,
  accepted: false,
};

describe("ConventionCard", () => {
  it("links evidence to GitHub file:line and accepts / rejects / edits", async () => {
    const onAccept = vi.fn();
    const onUnaccept = vi.fn();
    const onReject = vi.fn();
    const onEdit = vi.fn();
    renderWithProviders(
      <ConventionCard
        candidate={CAND}
        evidenceUrl="https://github.com/acme/api/blob/main/src/errors.ts#L12"
        onAccept={onAccept}
        onUnaccept={onUnaccept}
        onReject={onReject}
        onEdit={onEdit}
      />,
    );
    expect(screen.getByRole("link", { name: "src/errors.ts:12" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/main/src/errors.ts#L12",
    );
    await userEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onUnaccept).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByLabelText("Rule"));
    await userEvent.type(screen.getByLabelText("Rule"), "Always throw AppError");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenCalledWith({ rule: "Always throw AppError", category: "errors" });
  });

  it("unaccepts an already-accepted row without deleting it", async () => {
    const onAccept = vi.fn();
    const onUnaccept = vi.fn();
    renderWithProviders(
      <ConventionCard
        candidate={{ ...CAND, accepted: true }}
        evidenceUrl="https://github.com/acme/api/blob/main/src/errors.ts#L12"
        onAccept={onAccept}
        onUnaccept={onUnaccept}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(onUnaccept).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
  });
});
