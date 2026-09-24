import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 28px 48px", maxWidth: 960 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 8 } satisfies CSSProperties,
  titles: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent-text, var(--accent))" } satisfies CSSProperties,
  subtitle: { marginTop: 6, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.45 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "18px 0 14px",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  toolbarGrow: { flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  empty: { padding: "48px 0" } satisfies CSSProperties,
} as const;
