import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: '.',
  quiet: true,
  outputDir: '/tmp/openconnect-bch',
  timeout: 5 * 60 * 1000,
  retries: 0,
  workers: 1,
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
