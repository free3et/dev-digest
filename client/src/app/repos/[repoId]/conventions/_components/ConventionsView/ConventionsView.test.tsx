import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ConventionCandidate, ConventionExtractResult, ConventionSkillDraft, Skill } from "@devdigest/shared";
import { mockFetch, renderWithProviders, userEvent } from "@/test/render";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "r1", full_name: "acme/api", default_branch: "main" },
    repos: [],
    repoId: "r1",
    reposLoaded: true,
    setRepoId: () => {},
  }),
  useRepoNotFound: () => false,
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

const EXTRACT: ConventionExtractResult = {
  candidates: [CAND],
  proposed: 3,
  dropped_ungrounded: 2,
};

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "Use when reviewing this repo",
  body: "# Repository conventions\n\n- Throw AppError",
  evidence_files: ["src/errors.ts"],
  convention_ids: ["c1"],
};

const SKILL: Skill = {
  id: "sk1",
  name: "api-conventions",
  description: "Use when reviewing this repo",
  type: "convention",
  source: "extracted",
  body: "# Repository conventions",
  enabled: true,
  version: 1,
};

describe("ConventionsView", () => {
  beforeEach(() => {
    mockFetch({
      "GET /repos/r1/conventions": [],
      "GET /skills": [],
      "GET /agents": [],
    });
  });

  it("runs extraction and shows grounded candidates with a GitHub link", async () => {
    const calls = mockFetch({
      "GET /repos/r1/conventions": [],
      "GET /skills": [],
      "GET /agents": [],
      "POST /repos/r1/conventions/extract": EXTRACT,
    });
    renderWithProviders(<ConventionsView repoId="r1" />);
    await screen.findByText("No conventions extracted yet");
    await userEvent.click(screen.getAllByRole("button", { name: "Run Scan" })[0]!);
    expect(await screen.findByText(CAND.rule)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Conventions in api/ })).toBeInTheDocument();
    expect(screen.getByText(/Detected from 1 candidate/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "src/errors.ts:12" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/main/src/errors.ts#L12",
    );
    expect(calls.some((c) => c.method === "POST" && c.path === "/repos/r1/conventions/extract")).toBe(true);
  });

  it("rejects with DELETE, deselects with PATCH, and does not send skill_ids when linking", async () => {
    const accepted = { ...CAND, id: "c2", rule: "Keep files kebab-case", accepted: true };
    const calls = mockFetch({
      "GET /repos/r1/conventions": [CAND, accepted],
      "GET /skills": [],
      "GET /agents": [{ id: "a1", name: "API Contract Reviewer", description: "", provider: "openai", model: "gpt", system_prompt: "x", enabled: true, version: 1 }],
      "DELETE /conventions/c1": {},
      "PATCH /conventions/c2": { ...accepted, accepted: false },
      "POST /repos/r1/conventions/skill": DRAFT,
      "POST /skills": SKILL,
      "POST /agents/a1/skills": [],
    });
    renderWithProviders(<ConventionsView repoId="r1" />);
    expect(await screen.findByText(CAND.rule)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    await waitFor(() => {
      expect(screen.queryByText(CAND.rule)).not.toBeInTheDocument();
    });
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/conventions/c1")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PATCH" && c.path === "/conventions/c2")).toBe(true);
    });
  });

  it("creates a skill named repo-conventions and links with skill_id only", async () => {
    const calls = mockFetch({
      "GET /repos/r1/conventions": [{ ...CAND, accepted: true }],
      "GET /skills": [],
      "GET /agents": [{ id: "a1", name: "API Contract Reviewer", description: "", provider: "openai", model: "gpt", system_prompt: "x", enabled: true, version: 1 }],
      "POST /repos/r1/conventions/skill": DRAFT,
      "POST /skills": SKILL,
      "POST /agents/a1/skills": [],
    });
    renderWithProviders(<ConventionsView repoId="r1" />);
    expect(await screen.findByText(CAND.rule)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create skill" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("repo-conventions");
    expect(within(dialog).getByTestId("line-gutter")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Link to agent"), { target: { value: "a1" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create skill" }));
    await waitFor(() => {
      const create = calls.find((c) => c.method === "POST" && c.path === "/skills");
      expect(create?.body).toMatchObject({ name: "repo-conventions", type: "convention", source: "extracted" });
      const link = calls.find((c) => c.method === "POST" && c.path === "/agents/a1/skills");
      expect(link?.body).toEqual({ skill_id: "sk1" });
      expect(link?.body).not.toHaveProperty("skill_ids");
    });
  });
});
