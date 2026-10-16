/* Shared display formatters. Anything used by more than one feature folder
   belongs here; single-consumer helpers stay colocated with their component. */

/** Rendered in place of any number we do not have. Never show "$0.00" instead. */
export const EMPTY = "—";

/**
 * USD cost of a single run, e.g. "$0.0013", "$0.014", "$0.06".
 *
 * Run costs span three orders of magnitude — a flash model on a small diff is
 * ~$0.001, a frontier model on a large one is ~$0.10 — so a fixed precision is
 * either lossy at the bottom or noisy at the top. Formatting to 4dp and trimming
 * trailing zeros (down to a 2dp floor, so whole cents still read as money) gives
 * one rule that renders every band the way a person would write it.
 *
 * `null` means "we have no cost for this run" and renders as "—". That is a
 * different statement from "$0.00", which means the run genuinely was free — the
 * price book lists free models at 0.
 */
export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null || Number.isNaN(usd)) return EMPTY;
  if (usd === 0) return "$0.00";
  // Below 4dp resolution the trimmed output would round to "$0.0000", which
  // reads as free. Say "smaller than we display" instead.
  if (usd < 0.0001) return "<$0.0001";
  const [whole, frac = ""] = usd.toFixed(4).split(".");
  return `$${whole}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}

/**
 * Token count with space thousands separators, e.g. 9119 → "9 119". Spaces
 * rather than commas so the number reads as a quantity next to a dollar figure
 * without the two punctuation styles competing.
 *
 * Grouped by regex rather than `toLocaleString` + replace, so the separator is a
 * plain U+0020 that a test can type. The locale-aware version is a trap here:
 * its output is an ICU build detail, and it is far too easy to substitute a
 * look-alike THIN SPACE that renders identically but fails string equality.
 */
export function formatTokenCount(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** MINUS SIGN (U+2212), the typographic minus used in signed deltas. Asserted by code point in tests. */
export const MINUS = "−";

/** An eval metric in 0..1 as whole percent points, e.g. 0.784 → 78; null/NaN → null. */
export function toPercent(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return Math.round(v * 100);
}

/**
 * Delta B − A of two stored metrics, rounded to 6 decimals so float noise
 * (0.8 − 0.6) never decides a direction. Null when either side is null.
 * Always computed from stored values, never from rounded percents (EC-19).
 */
export function metricDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) * 1e6) / 1e6 + 0; // "+ 0" turns -0 into 0
}

export interface PointDelta {
  direction: "up" | "down" | "flat";
  /** |delta| × 100, rounded to a whole number. */
  points: number;
  /** A non-zero delta whose points round to 0 (shown as "<1"). */
  belowOne: boolean;
}

/** The one delta rule for every eval screen (banner, tiles, dashboard). Null in, null out. */
export function pointDelta(d: number | null | undefined): PointDelta | null {
  if (d == null || Number.isNaN(d)) return null;
  if (d === 0) return { direction: "flat", points: 0, belowOne: false };
  const points = Math.round(Math.abs(d) * 100);
  return { direction: d > 0 ? "up" : "down", points, belowOne: points === 0 };
}

/** Exact-instant timestamp, "2026-10-12 09:30 UTC": the tooltip of `RanAt`. Unparsable input is returned as is. */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Timestamp in the browser's zone (or `timeZone`), "2026-10-12 09:30". 24-hour,
 * zero-padded, no zone suffix. Unparsable input is returned as is.
 * `hourCycle: "h23"` because `hour12: false` can print "24:05".
 */
export function formatRanAtLocal(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
