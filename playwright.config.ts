import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 9 Playwright configuration.
 *
 * Targets the Vite dev server at localhost:5173.
 * The webServer block starts the server automatically if not already running.
 *
 * See: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source */
  forbidOnly: !!process.env.CI,
  /* Retry once on CI */
  retries: process.env.CI ? 1 : 0,
  /* Reporter to use */
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    /* Base URL to use in actions such as `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',
    /* Collect trace on first retry */
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || undefined
        }
      }
    }
  ],
  /* Start the Vite dev server before running tests */
  webServer: {
    command: 'npm run dev:ui',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
