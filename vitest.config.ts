import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // Loads .env so DB-backed tests find DATABASE_URL (does not override CI env).
    setupFiles: ["dotenv/config"],
    coverage: {
      provider: "v8",
      // json-summary is required by the PR-report action; json enables the
      // per-file drilldown; text prints a table in the CI log.
      reporter: ["text", "json", "json-summary"],
      // Write the summary even when a test fails, so the PR report still posts.
      reportOnFailure: true,
      // Measure all application source, not just files a test happened to import.
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**", // Prisma client, regenerated on install
        "src/**/*.d.ts",
        "src/**/layout.tsx", // App Router shells with no logic
        "**/*.config.*",
      ],
    },
  },
});
