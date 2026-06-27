import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // The service-layer integration tests share one Postgres and wipe tables
    // between runs, so test files must not execute concurrently against it.
    fileParallelism: false,
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
      // (In Vitest 4, setting `include` already reports untested files.)
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**", // Prisma client, regenerated on install
        "src/**/*.d.ts",
        "src/**/layout.tsx", // App Router shells with no logic
        "**/*.config.*",
      ],
      // Coverage floors. `npm run test:coverage` (and the CI gate that runs it)
      // exits non-zero if aggregate coverage drops below any of these, so a PR
      // that meaningfully lowers coverage fails. Set just below current coverage
      // to prevent erosion. These are a floor, not a target — ratchet them up as
      // coverage rises; never lower them to make a red build pass (add the
      // missing tests instead).
      //
      // Branch coverage is the metric we keep ratcheting toward 90%. As of
      // 2026-06-27 aggregate is ~88.9% branches / 95.4% stmts / 96.8% funcs /
      // 97.0% lines, so the branch floor steps 85→88 (and funcs/lines 95→96)
      // to lock in the SSRF/search/persona test additions. Statements stays at
      // 95 (only ~0.4 margin). Keep stepping branches up as the big remaining
      // gaps (review.ts, actions.ts) get covered.
      thresholds: {
        statements: 95,
        branches: 88,
        functions: 96,
        lines: 96,
      },
    },
  },
});
