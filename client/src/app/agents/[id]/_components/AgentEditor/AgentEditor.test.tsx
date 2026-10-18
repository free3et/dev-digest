import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// The Evals tab reads cases, history and runs through these hooks; empty, settled results are enough.
vi.mock("../../../../../lib/hooks/eval", () => ({
  useAgentEvalCases: () => ({ data: [], isLoading: false, isError: false }),
  useAgentEvalRuns: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useEvalRun: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useStartEvalRun: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
  useRunEvalCase: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined, variables: undefined }),
  // Owner-aware shared parts (Spec G2): the agent owner reads through these dispatchers.
  useOwnerEvalCases: () => ({ data: [], isLoading: false, isError: false }),
  useOwnerEvalRuns: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useStartSkillEvalRun: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
  useCreateSkillManualEvalCase: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
  useCreateManualEvalCase: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
  useUpdateEvalCase: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("lists Evals in the tab bar and renders the Evals tab for tab=evals", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(screen.getByText("Evals")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Eval metrics" })).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).not.toBeInTheDocument();
  });
});
