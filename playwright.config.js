const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const repoRoot = path.resolve(__dirname);

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: `python3 -m http.server 3100 --directory "${repoRoot}"`,
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
