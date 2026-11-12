import { defineConfig, devices } from '@playwright/test';
import {
  CI, ELEMENT_WAIT_EXTRA_LONG_TIME, ELEMENT_WAIT_LONGER_TIME, ELEMENT_WAIT_TIME,
} from './tests/core/constants';
import { server } from './tests/core/parameters';

export default defineConfig({
  testDir: process.cwd(),
  // Vitest unit tests live under tests/unit and must not be collected by Playwright.
  testIgnore: ['**/tests/unit/**'],
  // Playwright's 30s default is not enough here: every test creates a meeting and
  // joins at least one user, and the multi-user suite spins up two browser
  // contexts and two joins before its body even starts (~25-28s when workers run
  // in parallel). Scales with TIMEOUT_MULTIPLIER, so CI gets double.
  timeout: ELEMENT_WAIT_EXTRA_LONG_TIME * 6,
  workers: CI ? 1 : undefined,
  retries: CI ? 1 : 0,
  fullyParallel: true,
  forbidOnly: CI,
  reporter: CI
    ? [['blob'], ['list']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: server,
    headless: true,
    trace: 'on',
    screenshot: 'on',
    video: CI ? 'retain-on-failure' : 'on',
    actionTimeout: ELEMENT_WAIT_LONGER_TIME,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      slowMo: 0,
    },
    permissions: ['clipboard-read', 'clipboard-write', 'camera', 'microphone'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--no-sandbox',
            '--ignore-certificate-errors',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--allow-file-access-from-files',
          ],
        },
      },
    },
  ],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.05,
    },
    timeout: ELEMENT_WAIT_TIME,
  },
});
