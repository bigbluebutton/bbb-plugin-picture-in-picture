/**
 * Behavioural tests - deactivate menu inside the PiP window.
 *
 * The red button at the end of the PiP action bar opens a menu with three ways
 * out of the window (src/plugin-pip/components/actions/buttons/deactivate):
 *
 * - "Close" only closes the window; the plugin stays active and reopens it the
 *   next time the tab goes to the background.
 * - "Deactivate for this meeting" closes it and stores the meeting id under
 *   'pip-plugin-disabled-meeting', so it stays off in this meeting only.
 * - "Deactivate always" closes it and stores 'false' under 'pip-plugin-active',
 *   the same flag the options dropdown toggle writes.
 *
 * Each test gets its own meeting: two of the options change state the next
 * test would otherwise inherit.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  test, expect, BrowserContext, Browser, APIRequestContext, TestInfo, Page,
} from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_LONGER_TIME, ELEMENT_WAIT_TIME } from '../core/constants';
import { elements as e } from '../elements';
import { SessionPage as ModPage } from '../core/sessionPage';
import { Plugin } from '../core/plugin';
import { encodeCustomParams } from '../core/helpers';
import { installVisibilityOverride, setTabHidden } from '../core/tabVisibilityDriver';
import { openPipWindow } from '../core/pipWindowHelper';

const PLUGIN_NAME = 'picture-in-picture';
const ENV_VAR_NAME = 'PICTURE_IN_PICTURE_PLUGIN_URL';
const ACTIVE_KEY = 'pip-plugin-active';
const DISABLED_MEETING_KEY = 'pip-plugin-disabled-meeting';

let pluginUrl: string | undefined = process.env[ENV_VAR_NAME];
const setPluginUrl = (url: string) => { pluginUrl = url; };
const getPluginUrl = () => pluginUrl;

const readStorage = (page: Page, key: string) => page.evaluate(
  (k) => localStorage.getItem(k),
  key,
);

test.describe('Picture-in-Picture Plugin - deactivate menu', () => {
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
    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
  }

  test.beforeEach(async ({ browser, request }, testInfo) => {
    await setupMeeting(browser, request, testInfo);
  });

  test.afterEach(async () => {
    await context?.close();
  });

  /** Open the PiP window and its deactivate menu. */
  async function openDeactivateMenu(): Promise<Page> {
    const pipPage = await openPipWindow(context, modPage.page);
    await pipPage.getByRole('button', { name: 'Deactivate PiP Window' }).click();
    await expect(pipPage.getByRole('menu')).toBeVisible();
    return pipPage;
  }

  /** Label of the plugin's toggle in the client's options dropdown. */
  async function readToggleLabel(): Promise<string | undefined> {
    const item = modPage.page.locator(e.pipActionButton).first();
    if (!(await item.isVisible())) {
      await modPage.page.click(e.options);
      await item.waitFor({ state: 'visible', timeout: ELEMENT_WAIT_LONGER_TIME });
    }
    const label = (await item.textContent())?.trim();
    await modPage.page.keyboard.press('Escape');
    return label;
  }

  /** Bring the tab back and background it again; resolves to whether PiP reopened. */
  async function pipReopensOnBackground(timeout = ELEMENT_WAIT_TIME): Promise<boolean> {
    await setTabHidden(modPage.page, false);
    return openPipWindow(context, modPage.page, timeout).then(() => true, () => false);
  }

  test('lists the three ways out of the PiP window', async () => {
    const pipPage = await openDeactivateMenu();

    await expect(pipPage.getByRole('menuitem')).toHaveText([
      'Close',
      'Deactivate for this meeting',
      'Deactivate always',
    ]);
    // "Deactivate always" carries its own icon, distinct from the per-meeting one.
    const icons = await pipPage.getByRole('menuitem').evaluateAll(
      (items) => items.map((item) => item.querySelector('i')?.className),
    );
    expect(new Set(icons).size, 'each option should have a distinct icon').toBe(3);

    await setTabHidden(modPage.page, false);
  });

  test('"Close" closes the window and keeps the plugin active', async () => {
    const pipPage = await openDeactivateMenu();

    await pipPage.getByRole('menuitem', { name: 'Close' }).click();
    await expect.poll(() => pipPage.isClosed()).toBe(true);

    expect(await readStorage(modPage.page, ACTIVE_KEY)).not.toBe('false');
    expect(await readStorage(modPage.page, DISABLED_MEETING_KEY)).toBeNull();
    expect(await readToggleLabel()).toBe('Deactivate PiP Window');
    expect(await pipReopensOnBackground(), 'the window should open again').toBe(true);

    await setTabHidden(modPage.page, false);
  });

  test('"Deactivate for this meeting" keeps PiP off until it is activated again', async () => {
    const pipPage = await openDeactivateMenu();

    await pipPage.getByRole('menuitem', { name: 'Deactivate for this meeting' }).click();
    await expect.poll(() => pipPage.isClosed()).toBe(true);

    expect(await readStorage(modPage.page, DISABLED_MEETING_KEY)).toBeTruthy();
    // The global flag is untouched: other meetings still get the window.
    expect(await readStorage(modPage.page, ACTIVE_KEY)).not.toBe('false');
    expect(await readToggleLabel()).toBe('Activate PiP Window');
    expect(await pipReopensOnBackground(), 'the window should stay closed').toBe(false);

    // Activating from the options dropdown lifts the per-meeting block.
    await setTabHidden(modPage.page, false);
    await modPage.page.click(e.options);
    await modPage.page.locator(e.pipActionButton).first().click();
    expect(await readStorage(modPage.page, DISABLED_MEETING_KEY)).toBeNull();
    expect(await readToggleLabel()).toBe('Deactivate PiP Window');
    expect(await pipReopensOnBackground(ELEMENT_WAIT_LONGER_TIME)).toBe(true);

    await setTabHidden(modPage.page, false);
  });

  test('"Deactivate always" stores the inactive flag', async () => {
    const pipPage = await openDeactivateMenu();

    await pipPage.getByRole('menuitem', { name: 'Deactivate always' }).click();
    await expect.poll(() => pipPage.isClosed()).toBe(true);

    expect(await readStorage(modPage.page, ACTIVE_KEY)).toBe('false');
    expect(await readToggleLabel()).toBe('Activate PiP Window');
    expect(await pipReopensOnBackground(), 'the window should stay closed').toBe(false);

    await setTabHidden(modPage.page, false);
  });
});
