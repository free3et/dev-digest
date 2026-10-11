import { ApiError } from "@/lib/api";

/** The draft differs from the content loaded from disk. */
export function isDirty(draft: string, content: string): boolean {
  return draft !== content;
}

/** The server rejected the save because the file changed since it was loaded (HTTP 409). */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
