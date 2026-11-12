/**
 * Behavioural tests - single user (moderator / presenter only).
 *
 * The Picture-in-Picture plugin exposes a single options dropdown toggle
 * that flips an "active" flag, updates its own label/icon and persists the flag
 * to localStorage under 'pip-plugin-active'. These tests drive that toggle from
 * the client DOM (where it lives), which is fully reachable by Playwright.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  test, expect, BrowserContext, Browser, APIRequestContext, TestInfo,
} from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_EXTRA_LONG_TIME, ELEMENT_WAIT_LONGER_TIME, LOOP_INTERVAL } from '../core/constants';
import { elements as e } from '../elements';
import { SessionPage as ModPage } from '../core/sessionPage';
import { Plugin } from '../core/plugin';
import { encodeCustomParams } from '../core/helpers';
import { installVisibilityOverride, setTabHidden } from '../core/tabVisibilityDriver';
import { openPipWindow } from '../core/pipWindowHelper';

const PLUGIN_NAME = 'picture-in-picture';
const ENV_VAR_NAME = 'PICTURE_IN_PICTURE_PLUGIN_URL';
const STORAGE_KEY = 'pip-plugin-active';

let pluginUrl: string | undefined = process.env[ENV_VAR_NAME];
const setPluginUrl = (url: string) => { pluginUrl = url; };
const getPluginUrl = () => pluginUrl;

/** Open the options dropdown if the PiP toggle item is not already visible. */
async function openOptionsDropdown(modPage: ModPage) {
  const item = modPage.page.locator(e.pipActionButton).first();
  if (!(await item.isVisible())) {
    await modPage.page.click(e.options);
    await item.waitFor({ state: 'visible', timeout: ELEMENT_WAIT_LONGER_TIME });
  }
  return item;
}

const readActiveFlag = (modPage: ModPage) => modPage.page.evaluate(
  (key) => localStorage.getItem(key),
  STORAGE_KEY,
);

const ISOLATED = process.env.TEST_MEETINGS === 'isolated';

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('Picture-in-Picture Plugin - Behavioural (single user)', () => {
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
    // Must be installed before the first navigation so the override is in place
    // by the time the plugin registers its visibilitychange listener.
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
      if (modPage && await modPage.page.locator(e.pipActionButton).first().isVisible()) {
        await modPage.page.keyboard.press('Escape');
      }
    });
  }

  test('should default to the active state ("Deactivate PiP Window") on a fresh session', async (): Promise<void> => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    const item = await openOptionsDropdown(modPage);
    const label = (await item.textContent())?.trim();
    // With no stored flag the plugin defaults active=true, so the toggle offers
    // to DEACTIVATE. (Runs first in serial mode, before any toggle mutates it.)
    expect(label, 'fresh session should show the "Deactivate PiP Window" label').toBe('Deactivate PiP Window');
  });

  test('should toggle the label and persist the flag to localStorage when clicked', async (): Promise<void> => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    const item = await openOptionsDropdown(modPage);
    const before = (await item.textContent())?.trim();
    expect(before, 'toggle item should carry a PiP Window label').toMatch(/(Activate|Deactivate) PiP Window/);

    // First toggle.
    await item.click();
    const itemAfter = await openOptionsDropdown(modPage);
    const after = (await itemAfter.textContent())?.trim();
    expect(after, 'label should switch to the opposite action after a click').not.toBe(before);
    expect(after, 'label should still be a PiP Window action').toMatch(/(Activate|Deactivate) PiP Window/);

    // The persisted flag must agree with the shown label: "Deactivate" => active.
    const flagAfter = await readActiveFlag(modPage);
    const expectedFlag = after === 'Deactivate PiP Window' ? 'true' : 'false';
    expect(flagAfter, 'localStorage flag should mirror the toggled state').toBe(expectedFlag);

    // Second toggle restores the original label and flag.
    await itemAfter.click();
    const itemRestored = await openOptionsDropdown(modPage);
    const restored = (await itemRestored.textContent())?.trim();
    expect(restored, 'a second click should restore the original label').toBe(before);
    const flagRestored = await readActiveFlag(modPage);
    expect(flagRestored, 'localStorage flag should mirror the restored state').toBe(
      restored === 'Deactivate PiP Window' ? 'true' : 'false',
    );
  });

  // The plugin renders its grid INSIDE a documentPictureInPicture window, opened
  // from its `visibilitychange` handler when the tab goes hidden. Headless
  // Chromium cannot genuinely background a tab, so `installVisibilityOverride`
  // patches document.hidden and `openPipWindow` fires the event - see
  // tests/core/tabVisibilityDriver.ts for why the alternatives don't work. The
  // PiP window shows up as a normal page on the same context.
  test('should open the PiP window and render the plugin into it', async (): Promise<void> => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });

    // The plugin only opens the window while active; make sure it is.
    if (await readActiveFlag(modPage) === 'false') {
      const toggle = await openOptionsDropdown(modPage);
      await toggle.click();
    }

    const pipPage = await openPipWindow(sharedContext, modPage.page);

    expect(pipPage, 'the PiP window should be a separate page from the client').not.toBe(modPage.page);
    await expect(
      pipPage.locator(e.pipRoot),
      'the plugin should mount its React root inside the PiP window',
    ).toHaveCount(1);
    await expect(
      pipPage.locator('.container .video'),
      'the PiP window should contain the plugin streams container',
    ).toHaveCount(1);
    await expect(
      pipPage.locator(e.pipCameras),
      'the streams grid should render inside the PiP window',
    ).toHaveCount(1);
    await expect(
      pipPage.locator(e.pipWebcams),
      'the webcam grid should render inside the PiP window',
    ).toHaveCount(1);

    // Restoring visibility closes the window again (handleVisibilityChange's
    // else branch calls pipWindowRef.current?.close()).
    await setTabHidden(modPage.page, false);
    await expect
      .poll(
        () => sharedContext.pages().length,
        { timeout: ELEMENT_WAIT_LONGER_TIME, message: 'the PiP window should close when the tab becomes visible again' },
      )
      .toBe(1);
  });

  // Chromium runs with --use-fake-device-for-media-stream, so this shares the
  // synthetic camera. This is the one path a component test cannot cover: the
  // plugin reads the MediaStream off a <video> in the CLIENT document
  // (pollForVideoSrc + createVideoSelector) and re-attaches it to a <video> it
  // rendered in the PiP document. Asserting currentTime advances there proves
  // the stream really crossed the document boundary.
  test('should carry a live webcam stream into the PiP window', async (): Promise<void> => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });

    if (await readActiveFlag(modPage) === 'false') {
      const toggle = await openOptionsDropdown(modPage);
      await toggle.click();
    }

    await modPage.shareWebcam();
    await modPage.hasElement(e.webcamVideoItem, 'the client should show the shared webcam', ELEMENT_WAIT_EXTRA_LONG_TIME);

    const pipPage = await openPipWindow(sharedContext, modPage.page);

    const pipVideo = pipPage.locator(e.pipVideo).first();
    await expect(
      pipVideo,
      'the shared webcam should be rendered as a video element inside the PiP window',
    ).toBeAttached({ timeout: ELEMENT_WAIT_EXTRA_LONG_TIME });

    // The stream is assigned as srcObject, so there is no src attribute to check.
    const readVideoState = () => pipPage.evaluate((selector) => {
      const video = document.querySelector<HTMLVideoElement>(selector);
      if (!video) return null;
      return { currentTime: video.currentTime, hasSrcObject: Boolean(video.srcObject) };
    }, e.pipVideo);

    await expect
      .poll(
        async () => (await readVideoState())?.hasSrcObject ?? false,
        { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME, message: 'the PiP video should receive the MediaStream from the client document' },
      )
      .toBe(true);

    const before = await readVideoState();
    await modPage.page.waitForTimeout(LOOP_INTERVAL * 2);
    const after = await readVideoState();

    expect(
      after?.currentTime,
      'the webcam stream should be playing inside the PiP window (currentTime should advance)',
    ).toBeGreaterThan(before?.currentTime ?? 0);

    await setTabHidden(modPage.page, false);
  });
});
