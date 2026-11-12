/* eslint-disable import/no-extraneous-dependencies */
import { test as base } from '@playwright/test';
import { Plugin } from '../core/plugin';
import { SessionPage } from '../core/sessionPage';
import {
  encodeCustomParams,
  getJoinURL,
  generateSettingsData,
} from '../core/helpers';
import { ELEMENT_WAIT_EXTRA_LONG_TIME } from '../core/constants';
import { installVisibilityOverride } from '../core/tabVisibilityDriver';

export interface MultiUserTestFixtures {
  multiUserTest: {
    modPage: SessionPage;
    attendeePage: SessionPage;
  };
}

export type MultiUserTestConfig = {
  envVarName: string;
  getPluginUrl?: () => string | undefined;
};

/**
 * Creates a Playwright test instance whose `multiUserTest` fixture spins up
 * two independent browser contexts: one moderator (also presenter) and one
 * attendee, both joined into the same BBB meeting with the plugin active.
 */
export function createMultiUserTest(config: MultiUserTestConfig) {
  let pluginUrl: string | undefined = process.env[config.envVarName];

  const test = base.extend<MultiUserTestFixtures>({
    multiUserTest: async ({ browser }, use) => {
      const customUrl = config.getPluginUrl?.() || pluginUrl;
      if (!customUrl) {
        throw new Error(
          `Plugin URL is not set. Set ${config.envVarName} or ensure beforeAll ran successfully.`,
        );
      }

      const createParameter = encodeCustomParams(
        `pluginManifests=${JSON.stringify([{ url: customUrl }])}`,
      );

      // ── Moderator / presenter ────────────────────────────────────────────
      const modContext = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write', 'camera', 'microphone'],
        viewport: { width: 1280, height: 720 },
      });
      // Installed before the first navigation so PiP-window tests can background
      // the moderator's tab. Inert until a test flips the flag.
      await installVisibilityOverride(modContext);
      const modRawPage = await modContext.newPage();
      const sample = new Plugin({ browser });
      await sample.initModPage(modRawPage, { createParameter });
      const { modPage } = sample;

      // ── Attendee (viewer) ────────────────────────────────────────────────
      // Joins the same meeting already created by the moderator.
      const attendeeContext = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write', 'camera', 'microphone'],
        viewport: { width: 1280, height: 720 },
      });
      const attendeeRawPage = await attendeeContext.newPage();
      const attendeePage = new SessionPage({ browser, page: attendeeRawPage });
      attendeePage.username = 'Attendee';

      const joinUrl = getJoinURL({
        meetingID: modPage.meetingId,
        isModerator: false,
        skipSessionDetailsModal: true,
        fullName: attendeePage.username,
      });
      await attendeeRawPage.goto(joinUrl);
      await attendeeRawPage.waitForSelector('div#layout', { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME });
      attendeePage.settings = await generateSettingsData(attendeeRawPage);
      if (attendeePage.settings?.autoJoinAudioModal) {
        await attendeePage.closeAudioModal();
      }
      await attendeeRawPage.addStyleTag({
        content: "body { font-family: 'Liberation Sans', Arial, sans-serif; }",
      });
      attendeePage.meetingId = modPage.meetingId;

      await use({ modPage, attendeePage });

      await modContext.close();
      await attendeeContext.close();
    },
  });

  return {
    test,
    setPluginUrl: (url: string) => { pluginUrl = url; },
    getPluginUrl: () => pluginUrl,
  };
}
