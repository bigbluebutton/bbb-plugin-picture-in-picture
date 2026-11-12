// eslint-disable-next-line import/no-extraneous-dependencies
import {
  test, expect, BrowserContext, Browser, APIRequestContext, TestInfo,
} from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_LONGER_TIME } from '../core/constants';
import { elements as e } from '../elements';
import { SessionPage as ModPage } from '../core/sessionPage';
import { Plugin } from '../core/plugin';
import { encodeCustomParams } from '../core/helpers';
import { installVisibilityOverride, setTabHidden } from '../core/tabVisibilityDriver';
import { openPipWindow } from '../core/pipWindowHelper';

const PLUGIN_NAME = 'picture-in-picture';
const ENV_VAR_NAME = 'PICTURE_IN_PICTURE_PLUGIN_URL';

let pluginUrl: string | undefined = process.env[ENV_VAR_NAME];
const setPluginUrl = (url: string) => { pluginUrl = url; };
const getPluginUrl = () => pluginUrl;

test.describe('Picture-in-Picture Plugin - minimised presentation', () => {
  let modPage: ModPage;
  let context: BrowserContext;

  async function setupMeeting(browser: Browser, request: APIRequestContext, testInfo: TestInfo) {
    await checkPluginAvailability({
      pluginName: PLUGIN_NAME,
      setPluginUrl,
      getPluginUrl,
    })({ request }, testInfo);

    const createParameter = encodeCustomParams(
      `pluginManifests=${JSON.stringify([{ url: getPluginUrl() }])}`,
    );
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installVisibilityOverride(context);
    const page = await context.newPage();
    const plugin = new Plugin({ browser });
    await plugin.initModPage(page, { createParameter });
    modPage = plugin.modPage;
  }

  test.beforeEach(async ({ browser, request }, testInfo) => {
    await setupMeeting(browser, request, testInfo);
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('fills the grid with the webcam and disables swap while presentation is minimised', async () => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    await modPage.shareWebcam();
    const pipPage = await openPipWindow(context, modPage.page);
    const slide = pipPage.locator('.pip-slide-item');
    const grid = pipPage.locator(e.pipWebcams);

    await expect(slide).toBeVisible({ timeout: ELEMENT_WAIT_LONGER_TIME });
    await expect(pipPage.getByRole('button', { name: 'Unfocus content' })).toBeEnabled();

    await modPage.page.click('[data-test="minimizePresentation"]');
    await expect(slide).toHaveCount(0, { timeout: ELEMENT_WAIT_LONGER_TIME });
    await expect(pipPage.locator(e.pipVideo)).toBeVisible();
    await expect.poll(() => grid.evaluate((element) => (
      (element as HTMLElement).style.gridTemplateColumns
    ))).toBe('repeat(1, 1fr)');
    await expect(pipPage.locator('.pip-content-focused')).toHaveCount(0);
    await expect(pipPage.getByRole('button', { name: 'Focus content' })).toBeDisabled();

    await modPage.page.click('[data-test="restorePresentation"]');
    await expect(slide).toBeVisible({ timeout: ELEMENT_WAIT_LONGER_TIME });
    await expect(slide).toHaveClass(/pip-content-focused/);
    await expect(pipPage.getByRole('button', { name: 'Unfocus content' })).toBeEnabled();

    await setTabHidden(modPage.page, false);
  });

  test('keeps the PiP controls open when minimised without a webcam', async () => {
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    const pipPage = await openPipWindow(context, modPage.page);

    await modPage.page.click('[data-test="minimizePresentation"]');

    await expect(pipPage.locator(e.pipCameras)).toHaveCount(0);
    await expect(pipPage.getByRole('button', { name: 'Focus content' })).toBeDisabled();

    await setTabHidden(modPage.page, false);
  });
});
