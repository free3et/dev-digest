import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Pin the zone before any worker starts: local-time formatting (formatRanAtLocal)
// must be deterministic. Non-UTC cases pass `timeZone` explicitly.
process.env.TZ = "UTC";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@devdigest/shared": path.resolve(__dirname, "src/vendor/shared"),
      "@devdigest/ui": path.resolve(__dirname, "src/vendor/ui"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
