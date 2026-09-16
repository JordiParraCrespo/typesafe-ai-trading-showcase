import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3000', reuseExistingServer: true },
});
