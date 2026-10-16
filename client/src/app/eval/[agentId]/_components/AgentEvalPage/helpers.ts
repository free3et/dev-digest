import { ApiError } from "@/lib/api";

/**
 * Lenient 8-4-4-4-12 hex, case-insensitive, nil accepted: the same set as Zod 3
 * `.uuid()` on the server (`_shared/schemas.ts`), so a valid id is never turned
 * away here. Anything else must not reach an API path (Spec F AC-2, NFR-3).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

export type PageState = "invalid" | "loading" | "notFound" | "error" | "ready";

/** The slice of a query result `pageState` reads. */
export interface QueryLike {
  data: unknown;
  error: unknown;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Which body the page shows (Spec F F7). A 404 from the agent or from its runs
 * wins even when data is cached, so a deleted agent replaces the page (AC-3).
 * An agent that has data stays `ready` through a later non-404 failure.
 */
export function pageState({
  validId,
  agent,
  runs,
}: {
  validId: string | null;
  agent: QueryLike;
  runs: QueryLike;
}): PageState {
  if (!validId) return "invalid";
  if (isNotFound(agent.error) || isNotFound(runs.error)) return "notFound";
  if (agent.data !== undefined) return "ready";
  if (agent.error) return "error";
  return "loading";
}
