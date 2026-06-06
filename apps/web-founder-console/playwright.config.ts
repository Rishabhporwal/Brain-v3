import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config (M5). The test drives the real onboarding click-through against a locally-running stack:
 *   Postgres :5440 · ClickHouse :8125 · Keycloak :8080 (host mode) · BFF :4000 · web :3000.
 *
 * Bring the stack up first (`make -C deploy/local up` + the BFF) — in CI the workflow does this and
 * sets E2E_EXTERNAL_SERVER=1 so Playwright reuses the already-running web server instead of starting one.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Start the web server unless one is already running (CI brings it up via compose).
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'pnpm start',
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
})
