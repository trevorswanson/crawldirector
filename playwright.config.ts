import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // A test that fails then passes on retry is "flaky". In CI, treat that as a
  // failure rather than a silent green so retry-masked instability surfaces
  // instead of accumulating. (Local runs use retries: 0, so nothing is flaky.)
  failOnFlakyTests: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Retain video for any test that failed at least once (including flaky
    // retries), so the report CI uploads on failure includes a replay.
    video: "retain-on-failure-and-retries",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
