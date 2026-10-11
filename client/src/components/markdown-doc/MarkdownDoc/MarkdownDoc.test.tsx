import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MarkdownDoc } from "./MarkdownDoc";

afterEach(cleanup);

const TABLE = [
  "| Model | $/M | ~$/run |",
  "| :--- | :---: | ---: |",
  "| deepseek-v4-flash | 0.09 / 0.18 | ~$0.015 |",
  "| claude-sonnet-4.6 | 3 / 15 | ~$0.05 |",
].join("\n");

describe("MarkdownDoc tables", () => {
  it("renders a table with header cells and body rows inside a scroll container", () => {
    render(<MarkdownDoc>{TABLE}</MarkdownDoc>);
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveStyle({ overflowX: "auto" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Model", "$/M", "~$/run"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("keeps cell text from breaking inside a token and honours the column alignment", () => {
    render(<MarkdownDoc>{TABLE}</MarkdownDoc>);
    const price = screen.getByRole("cell", { name: "~$0.015" });
    expect(price).toHaveStyle({ overflowWrap: "normal", wordBreak: "normal", textAlign: "right" });
    expect(screen.getByRole("cell", { name: "0.09 / 0.18" })).toHaveStyle({ textAlign: "center" });
    expect(screen.getByRole("cell", { name: "deepseek-v4-flash" })).toHaveStyle({ textAlign: "left" });
  });

  it("does not render raw HTML from the document", () => {
    const { container } = render(<MarkdownDoc>{"<script>alert(1)</script>\n\ntext"}</MarkdownDoc>);
    expect(container.querySelector("script")).toBeNull();
  });
});
