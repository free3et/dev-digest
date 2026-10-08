import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { ContextAttachment, InheritedContextAttachment, SpecFile } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { ContextDocsPicker } from "./ContextDocsPicker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const att = (path: string, tokens: number | null, o: Partial<ContextAttachment> = {}): ContextAttachment => ({
  path, doc_type: "specs", approx_tokens: tokens, missing: false, too_large: false, ...o,
});
const doc = (path: string, tokens = 10): SpecFile => ({ path, doc_type: "docs", approx_tokens: tokens, size: 100, used_by_agents: 0 });
const inh: InheritedContextAttachment = { ...att("docs/inherited.md", 3), skill_id: "s1", skill_name: "arch" };

const DOCS = [doc("specs/a.md"), doc("specs/b.md"), doc("docs/inherited.md"), doc("docs/other.md")];

function setup(own: ContextAttachment[], extra: Partial<Parameters<typeof ContextDocsPicker>[0]> = {}) {
  const onChange = vi.fn();
  renderWithProviders(
    <ContextDocsPicker repoId="r1" own={own} inherited={[inh]} documents={DOCS} onChange={onChange} {...extra} />,
  );
  return onChange;
}

describe("ContextDocsPicker", () => {
  it("lists rows with path-named checkboxes, K of N, and inherited rows read-only", () => {
    setup([att("specs/b.md", 5)]);
    expect(screen.getByText("1 of 4 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "specs/b.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "specs/a.md" })).not.toBeChecked();
    const inherited = screen.getByRole("checkbox", { name: "docs/inherited.md" });
    expect(inherited).toBeDisabled();
    expect(screen.getByText("via skill arch")).toBeInTheDocument();
    expect(screen.getByText("≈ 5 tok")).toBeInTheDocument();
    expect(screen.getAllByText("specs").length).toBeGreaterThan(0);
  });

  it("narrows rows with the filter", () => {
    setup([]);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents" }), { target: { value: "OTHER" } });
    expect(screen.getByRole("checkbox", { name: "docs/other.md" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "specs/a.md" })).not.toBeInTheDocument();
  });

  it("Preview opens a dialog with the rendered document", async () => {
    mockFetch({ "GET /repos/r1/context/file?path=specs%2Fa.md": { ...doc("specs/a.md"), content: "# Hello doc" } });
    setup([]);
    fireEvent.click(screen.getByRole("button", { name: "Preview specs/a.md" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "Hello doc" })).toBeInTheDocument();
  });

  it("Move up emits the reordered full list; toggle emits attach/detach", () => {
    const onChange = setup([att("specs/a.md", 1), att("specs/b.md", 2)]);
    fireEvent.click(screen.getByRole("button", { name: "Move specs/b.md up" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/b.md", "specs/a.md"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "docs/other.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/a.md", "specs/b.md", "docs/other.md"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/a.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/b.md"]);
  });

  it("shows the over-256 KB label without a token estimate for a too_large row", () => {
    setup([att("specs/a.md", null, { too_large: true })]);
    expect(screen.getByText("Skipped — over 256 KB")).toBeInTheDocument();
    const row = screen.getByRole("checkbox", { name: "specs/a.md" }).closest("li")!;
    expect(within(row).queryByText(/≈/)).not.toBeInTheDocument();
  });

  it("Move down emits the reordered list; the first Move up and the last Move down send nothing", () => {
    const onChange = setup([att("specs/a.md", 1), att("specs/b.md", 2)]);
    fireEvent.click(screen.getByRole("button", { name: "Move specs/a.md up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move specs/b.md down" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Move specs/a.md down" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(["specs/b.md", "specs/a.md"]);
  });

  it("dragging an attached row onto another emits the new order; inherited rows are not draggable", () => {
    const onChange = setup([att("specs/a.md", 1), att("specs/b.md", 2)]);
    const rowOf = (path: string) => screen.getByRole("checkbox", { name: path }).closest("li")!;
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(rowOf("specs/a.md"), { dataTransfer });
    fireEvent.dragOver(rowOf("specs/b.md"), { dataTransfer });
    fireEvent.drop(rowOf("specs/b.md"), { dataTransfer });
    expect(onChange).toHaveBeenLastCalledWith(["specs/b.md", "specs/a.md"]);
    expect(rowOf("docs/inherited.md")).not.toHaveAttribute("draggable", "true");
  });

  it("an unattached document over 262144 bytes shows the skipped label, one at the cap shows tokens", () => {
    const big = { ...doc("specs/big.md", 99), size: 262_145 };
    const edge = { ...doc("specs/edge.md", 55), size: 262_144 };
    setup([], { documents: [big, edge] });
    const bigRow = screen.getByRole("checkbox", { name: "specs/big.md" }).closest("li")!;
    const edgeRow = screen.getByRole("checkbox", { name: "specs/edge.md" }).closest("li")!;
    expect(within(bigRow).getByText("Skipped — over 256 KB")).toBeInTheDocument();
    expect(within(bigRow).queryByText(/≈/)).not.toBeInTheDocument();
    expect(within(edgeRow).getByText("≈ 55 tok")).toBeInTheDocument();
  });

  it("a missing row shows 'missing' and Detach saves the list without it", () => {
    const onChange = setup([att("specs/gone.md", null, { missing: true }), att("specs/a.md", 1)]);
    expect(screen.getByText("missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detach specs/gone.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/a.md"]);
  });
});
