import { TABS } from "./constants";

/** Any unknown / missing `?tab=` value falls back to the Config tab. Derived from `TABS` so a new tab cannot be forgotten here. */
export function parseAgentTab(raw: string | null | undefined): string {
  return TABS.find((t) => t.key === raw)?.key ?? "config";
}
