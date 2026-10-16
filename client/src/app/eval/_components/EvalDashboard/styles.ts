import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", flexDirection: "column", gap: 20, padding: "24px 28px" } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  // Caption style (size, weight, colour) is spread on top of this in the component.
  h2: { display: "flex", alignItems: "center", gap: 6, margin: 0 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
} as const;
