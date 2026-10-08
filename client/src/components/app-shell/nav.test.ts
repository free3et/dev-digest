import { describe, expect, it } from "vitest";
import { NAV } from "@devdigest/ui";
import { registerContextNav } from "./nav";

const workspace = () => NAV.find((g) => g.section === "WORKSPACE")!;

describe("registerContextNav", () => {
  it("puts Project Context in WORKSPACE right after Pull Requests with the context href", () => {
    const items = workspace().items;
    const i = items.findIndex((it) => it.key === "pulls");
    expect(items[i + 1]).toMatchObject({
      key: "context",
      label: "Project Context",
      icon: "FileText",
      href: "/repos/:repoId/context",
    });
    expect(items[i + 1]?.gKey).toBeUndefined();
  });

  it("is idempotent", () => {
    registerContextNav();
    registerContextNav();
    expect(NAV.flatMap((g) => g.items).filter((it) => it.key === "context")).toHaveLength(1);
  });
});
