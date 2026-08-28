import { defineConfig } from '@playwright/test';
// eslint-disable-next-line import/extensions -- ".config" is not a file extension
import baseConfig from './playwright.config';

/**
 * Config for the interactive live-meeting driver (tests/interactive).
 *
 * The main config deliberately ignores that folder so `npm test` never picks it
 * up; this one points straight at it and lifts the limits a normal test run
 * needs: no timeout (the session is meant to last as long as you asked for),
 * one worker, no retries, and no video/trace/screenshot recording — an hour of
 * seven contexts would fill the disk for artifacts nobody will look at.
 *
 * Browser launch args (fake camera, no sandbox) are inherited from the base
 * config's chromium project, plus one this file adds: the beeping bots build
 * their microphone with WebAudio, and an AudioContext blocked by the autoplay
 * policy renders silence.
 */
export default defineConfig({
  ...baseConfig,
  testDir: './tests/interactive',
  testIgnore: [],
  timeout: 0,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...baseConfig.use,
    video: 'off',
    trace: 'off',
    screenshot: 'off',
  },
  projects: (baseConfig.projects || []).map((project) => ({
    ...project,
    use: {
      ...project.use,
      launchOptions: {
        ...project.use?.launchOptions,
        args: [
          ...(project.use?.launchOptions?.args || []),
          '--autoplay-policy=no-user-gesture-required',
        ],
      },
    },
  })),
});
