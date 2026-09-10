/**
 * Structural tests - verify the Picture-in-Picture plugin registers its
 * action-button dropdown toggle with the correct label.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  test, expect, BrowserContext, Browser, APIRequestContext, TestInfo,
} from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_EXTRA_LONG_TIME, ELEMENT_WAIT_LONGER_TIME } from '../core/constants';
import { elements as e } from '../elements';
import { SessionPage as ModPage } from '../core/sessionPage';
import { Plugin } from '../core/plugin';
import { encodeCustomParams } from '../core/helpers';
import { installVisibilityOverride, setTabHidden } from '../core/tabVisibilityDriver';
import { openPipWindow, readComputedStyle } from '../core/pipWindowHelper';

const PLUGIN_NAME = 'picture-in-picture';
const ENV_VAR_NAME = 'PICTURE_IN_PICTURE_PLUGIN_URL';

let pluginUrl: string | undefined = process.env[ENV_VAR_NAME];
const setPluginUrl = (url: string) => { pluginUrl = url; };
const getPluginUrl = () => pluginUrl;

/** Open the actions dropdown if it isn't already showing the PiP toggle item. */
async function openActionsDropdown(modPage: ModPage) {
  const item = modPage.page.locator(e.pipActionButton).first();
  if (!(await item.isVisible())) {
    await modPage.page.click(e.actions);
    await item.waitFor({ state: 'visible', timeout: ELEMENT_WAIT_LONGER_TIME });
  }
  return item;
}

const ISOLATED = process.env.TEST_MEETINGS === 'isolated';

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('Picture-in-Picture Plugin - Structural', () => {
  test.describe.configure({ mode: ISOLATED ? 'default' : 'serial' });

  let modPage: ModPage;
  let sharedContext: BrowserContext;

  async function setupMeeting(browser: Browser, request: APIRequestContext, testInfo: TestInfo) {
    await checkPluginAvailability({
      pluginName: PLUGIN_NAME,
      setPluginUrl,
      getPluginUrl,
    })({ request }, testInfo);

    const createParameter = encodeCustomParams(
      `pluginManifests=${JSON.stringify([{ url: getPluginUrl() }])}`,
    );
    sharedContext = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write', 'camera', 'microphone'],
      viewport: { width: 1280, height: 720 },
    });
    // Installed before the first navigation so the PiP-window test below can
    // background the tab; inert until a test flips the flag.
    await installVisibilityOverride(sharedContext);
    const page = await sharedContext.newPage();
    const plugin = new Plugin({ browser });
    await plugin.initModPage(page, { createParameter });
    modPage = plugin.modPage;
  }

  if (ISOLATED) {
    test.beforeEach(async ({ browser, request }, testInfo) => {
      await setupMeeting(browser, request, testInfo);
    });
    test.afterEach(async () => {
      await sharedContext?.close();
    });
  } else {
    test.beforeAll(async ({ browser, request }, testInfo) => {
      await setupMeeting(browser, request, testInfo);
    });
    test.afterAll(async () => {
      await sharedContext?.close();
    });
    test.afterEach(async () => {
      // Leave the dropdown closed for the next test.
      if (modPage && await modPage.page.locator(e.pipActionButton).first().isVisible()) {
        await modPage.page.keyboard.press('Escape');
      }
    });
  }

  test('should register the PiP toggle item in the actions dropdown', async (): Promise<void> => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    await modPage.page.click(e.actions);
    await modPage.hasElement(
      e.pipActionButton,
      'should display the Picture-in-Picture toggle item in the actions dropdown',
      ELEMENT_WAIT_LONGER_TIME,
    );
  });

  test('should label the toggle item with "PiP Window"', async (): Promise<void> => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    await openActionsDropdown(modPage);
    await modPage.hasText(
      e.pipActionButton,
      'PiP Window',
      'the toggle item label should mention "PiP Window"',
    );
  });

  // The plugin renders its grid into a Document Picture-in-Picture window rather
  // than into the client document, so "does it mount" can only be answered
  // inside that window. The presentation alone is media enough for the plugin to
  // open it - no webcam or screenshare needed.
  test('should open the PiP window and render the grid container with the #111 background', async (): Promise<void> => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });

    const pipPage = await openPipWindow(sharedContext, modPage.page);

    await expect(
      pipPage.locator(e.pipRoot),
      'the plugin should mount its React root inside the PiP window',
    ).toHaveCount(1);
    await expect(
      pipPage.locator(e.pipWebcams),
      'the streams grid should render inside the PiP window',
    ).toHaveCount(1);

    // The presentation snapshot arrives on a 5s poll, so the first cell can take
    // a moment to appear.
    await expect(
      pipPage.locator(e.pipVideoContainer).first(),
      'the grid should render at least one non-avatar cell (the presentation)',
    ).toBeAttached({ timeout: ELEMENT_WAIT_EXTRA_LONG_TIME });

    const style = await readComputedStyle(pipPage, e.pipSlideItem, ['background-color']);
    expect(
      style?.['background-color'],
      'the presentation cell should use the #111 container background',
    ).toBe('rgb(17, 17, 17)');

    await setTabHidden(modPage.page, false);
  });
});
