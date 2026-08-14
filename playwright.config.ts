import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  testMatch: [
    'agent-session-interaction.spec.ts',
    'interaction-os/**/*.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4310',
    launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
