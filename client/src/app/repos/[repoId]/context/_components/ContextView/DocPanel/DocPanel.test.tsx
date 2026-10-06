import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { SpecFile } from "@devdigest/shared";
import { mockFetch, renderWithProviders } from "@/test/render";
import { DocPanel } from "./DocPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PATH = "docs/a.md";
const FILE_URL = `GET /repos/r1/context/file?path=${encodeURIComponent(PATH)}`;

const file = (content: string, content_hash = "h1"): SpecFile => ({
  path: PATH,
  content,
  size: content.length,
  updated_at: null,
  doc_type: "docs",
  approx_tokens: Math.ceil(content.length / 4),
  content_hash,
});

describe("DocPanel preview", () => {
  it("renders markdown headings in Preview mode with the toggle pressed", async () => {
    mockFetch({ [FILE_URL]: file("# Title\n\nSome **bold** text.") });
    renderWithProviders(<DocPanel repoId="r1" path={PATH} />);
    expect(await screen.findByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "false");
  });

  it("never renders raw HTML from the file as elements", async () => {
    mockFetch({
      [FILE_URL]: file('# Safe\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\ntext'),
    });
    const { container } = renderWithProviders(<DocPanel repoId="r1" path={PATH} />);
    await screen.findByRole("heading", { name: "Safe" });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    // AC-8: the raw markup is shown as visible text, not dropped.
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain('<img src=x onerror="alert(2)">');
  });

  it("shows an inline error and Retry refetches the file", async () => {
    let n = 0;
    const fn = vi.fn(async () =>
      n++ === 0
        ? new Response(JSON.stringify({ error: { code: "internal", message: "boom" } }), { status: 500 })
        : new Response(JSON.stringify(file("# Back")), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fn);
    renderWithProviders(<DocPanel repoId="r1" path={PATH} />);
    expect(await screen.findByText("Couldn’t load document")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Back" })).toBeInTheDocument();
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });
});

/* ---- Edit mode (T12): written failing on purpose; implemented in T19 (wave 2B). ---- */
const BANNER = "Local edit only — not committed. A repository resync overwrites it.";

async function openEditor() {
  const view = renderWithProviders(<DocPanel repoId="r1" path={PATH} />);
  await screen.findByRole("heading", { name: "Title" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return { ...view, area: screen.getByLabelText("Document content") as HTMLTextAreaElement };
}

describe("DocPanel edit mode", () => {
  it("shows the local-edit banner and a labelled textarea seeded with the loaded content", async () => {
    mockFetch({ [FILE_URL]: file("# Title\n\nbody") });
    const { area } = await openEditor();
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.value).toBe("# Title\n\nbody");
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("shows the unsaved badge while the text differs and hides it when it equals the loaded content", async () => {
    mockFetch({ [FILE_URL]: file("# Title\n\nbody") });
    const { area } = await openEditor();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    fireEvent.change(area, { target: { value: "# Title\n\nbody changed" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.change(area, { target: { value: "# Title\n\nbody" } });
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("Discard restores the loaded content", async () => {
    mockFetch({ [FILE_URL]: file("# Title\n\nbody") });
    const { area } = await openEditor();
    fireEvent.change(area, { target: { value: "something else" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(area.value).toBe("# Title\n\nbody");
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("Save sends { path, content, base_hash } with the loaded content_hash", async () => {
    const calls = mockFetch({
      [FILE_URL]: file("# Title\n\nbody", "h1"),
      "PUT /repos/r1/context/file": file("# Title\n\nnew", "h2"),
    });
    const { area } = await openEditor();
    fireEvent.change(area, { target: { value: "# Title\n\nnew" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      path: PATH,
      content: "# Title\n\nnew",
      base_hash: "h1",
    });
  });

  it("on 409 shows the conflict message and Reload refetches fresh content and leaves Edit", async () => {
    let gets = 0;
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (method === "PUT") return json({ error: { code: "conflict", message: "content changed since loaded" } }, 409);
      void url;
      return json(gets++ === 0 ? file("# Title\n\nbody", "h1") : file("# Fresh\n\ncontent", "h2"));
    });
    vi.stubGlobal("fetch", fn);
    const { area } = await openEditor();
    fireEvent.change(area, { target: { value: "# Title\n\nmine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/changed on disk/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByRole("heading", { name: "Fresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Document content")).not.toBeInTheDocument();
    expect(gets).toBe(2);
  });
});
