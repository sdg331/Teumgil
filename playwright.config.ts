import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 180_000, expect: { timeout: 15_000 },
  outputDir: '.harness/playwright/results',
  reporter: [['list'], ['html', { outputFolder: '.harness/playwright/report', open: 'never' }]],
  use: { baseURL: process.env.TEUMGIL_E2E_URL ?? 'http://localhost:3000', ...devices['Desktop Chrome'], actionTimeout: 15_000, navigationTimeout: 45_000, trace: 'on', screenshot: 'only-on-failure', locale: 'ko-KR', timezoneId: 'Asia/Seoul' },
});
