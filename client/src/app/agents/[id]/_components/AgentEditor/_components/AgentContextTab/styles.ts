import type { CSSProperties } from "react";

export const s = {
  title: { fontSize: 16, fontWeight: 700, marginBottom: 6 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  center: { display: "flex", alignItems: "center", gap: 10, padding: "24px 0", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  spinner: {
    width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--border)",
    borderTopColor: "var(--accent)", animation: "ddspin .8s linear infinite", display: "inline-block",
  } satisfies CSSProperties,
  footer: { marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  total: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
