import { describe, expect, it } from "vitest";
import { NAV } from "@devdigest/ui";
import {
  registerAgentsInSkillsLab,
  registerContextNav,
  registerConventionsNav,
  registerEvalDashboardNav,
  registerSkillsNav,
} from "./nav";

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

const lab = () => NAV.find((g) => g.section === "SKILLS LAB")!;

describe("registerEvalDashboardNav", () => {
  it("orders SKILLS LAB as Skills, Agents, Eval Dashboard, Conventions after all register calls", () => {
    registerSkillsNav();
    registerAgentsInSkillsLab();
    registerEvalDashboardNav();
    registerConventionsNav();
    expect(lab().items.map((it) => it.key)).toEqual(["skills", "agents", "eval", "conventions"]);
    expect(lab().items[2]).toMatchObject({ label: "Eval Dashboard", icon: "FlaskConical", href: "/eval" });
  });

  it("is idempotent and keeps gKeys unique", () => {
    registerEvalDashboardNav();
    registerEvalDashboardNav();
    const items = NAV.flatMap((g) => g.items);
    expect(items.filter((it) => it.key === "eval")).toHaveLength(1);
    const gKeys = items.map((it) => it.gKey).filter(Boolean);
    expect(new Set(gKeys).size).toBe(gKeys.length);
  });
});
