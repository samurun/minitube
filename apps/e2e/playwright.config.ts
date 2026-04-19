import { defineConfig, devices } from "@playwright/test"

// Prereqs before running `pnpm --filter e2e test`:
//   1. `pnpm docker:infra`   — Postgres + MinIO + RabbitMQ
//   2. `pnpm dev:all`        — API + Web + workers
// Or set E2E_BASE_URL / E2E_API_URL to point at a deployed stack.

const WEB_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html"]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
