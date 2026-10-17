import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { HostPicker } from "./HostPicker";

afterEach(cleanup);

const AGENTS = [
  { id: "h1", name: "Reviewer A", model: "gpt-x" },
  { id: "h2", name: "A".repeat(80), model: "m".repeat(80) },
];

describe("HostPicker", () => {
  it("is a combobox named Host agent with 'No agent' then one option per agent", () => {
    renderWithProviders(<HostPicker agents={AGENTS} value="h1" onChange={() => {}} hintId="hint" />);
    const select = screen.getByRole("combobox", { name: "Host agent" });
    expect(select).toHaveValue("h1");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options[0]).toBe("No agent");
    expect(options[1]).toBe("Reviewer A · gpt-x");
    expect(options).toHaveLength(3);
    expect(select).toHaveAttribute("title", "Reviewer A · gpt-x");
    expect(screen.queryByText("Pick an agent to run this skill's evals")).toBeNull();
    // a long name keeps the full text reachable
    expect(screen.getByRole("option", { name: new RegExp(`^A{80} · m{80}$`) })).toHaveAttribute("title", `${"A".repeat(80)} · ${"m".repeat(80)}`);
  });

  it("reports the chosen id, null for 'No agent', and shows the hint with no host", () => {
    const onChange = vi.fn();
    renderWithProviders(<HostPicker agents={AGENTS} value={null} onChange={onChange} hintId="hint" />);
    expect(screen.getByText("Pick an agent to run this skill's evals")).toHaveAttribute("id", "hint");
    const select = screen.getByRole("combobox", { name: "Host agent" });
    fireEvent.change(select, { target: { value: "h2" } });
    expect(onChange).toHaveBeenLastCalledWith("h2");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
