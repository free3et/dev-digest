import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 28px 48px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18 } satisfies CSSProperties,
  titles: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { marginTop: 6, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.45 } satisfies CSSProperties,
  body: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  } satisfies CSSProperties,
  listCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  footer: {
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  prompt: { padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
