export type RunDisabledReason = "disabledRunning" | "disabledNoCases" | "disabledNoHost";

/** Why "Run on evals" is disabled; the first match wins (Spec G2 AC-10, AC-6). */
export function disabledReason(state: { running: boolean; caseCount: number; hasHost: boolean }): RunDisabledReason | null {
  if (state.running) return "disabledRunning";
  if (state.caseCount === 0) return "disabledNoCases";
  if (!state.hasHost) return "disabledNoHost";
  return null;
}
