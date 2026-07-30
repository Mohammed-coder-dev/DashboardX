import { defineConfig, devices } from "@playwright/test";

// Browser journeys run against the real Express server. No Anthropic key is
// configured, so every AI path is exercised through its keyless/mocked branch
// and the suite never makes a provider call.
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure",
  },
  projects: [
    // Mobile specs need a touch-enabled context, so they run only in the
    // mobile project and are explicitly excluded from the desktop one.
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.js/ },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testMatch: /mobile\.spec\.js/ },
  ],
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:3210/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: "3210",
      // Keyless by design, and generous limits so a full journey run is not
      // throttled by the per-IP limiter.
      ANTHROPIC_API_KEY: "",
      RATE_LIMIT_POINTS: "10000",
      RATE_LIMIT_ASK_POINTS: "10000",
    },
  },
});
