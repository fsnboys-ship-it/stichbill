import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} },
  webServer: [
    { command: 'npm run dev:api', url: 'http://127.0.0.1:3001/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'npm run dev:web', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
});
