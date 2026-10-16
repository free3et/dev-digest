import type { EvalSuiteRun } from "@devdigest/shared";
import { isFinished } from "../helpers";

/** Only finished runs (`done`, `partial`) can be compared (Spec B AC-5). */
export function isSelectable(run: Pick<EvalSuiteRun, "status">): boolean {
  return isFinished(run);
}

export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/**
 * The selection that can actually be compared: ids still present in the
 * history and still selectable (a history refetch can drop or change a row).
 */
export function effectiveSelection(selected: readonly string[], runs: readonly EvalSuiteRun[]): string[] {
  const ok = new Set(runs.filter(isSelectable).map((r) => r.id));
  return selected.filter((id) => ok.has(id));
}
