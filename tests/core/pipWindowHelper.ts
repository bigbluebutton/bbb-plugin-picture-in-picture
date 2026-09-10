import { BrowserContext, Page } from '@playwright/test';
import { ELEMENT_WAIT_LONGER_TIME, LOOP_INTERVAL } from './constants';
import { setTabHidden } from './tabVisibilityDriver';

/**
 * Helpers for driving the plugin's Document Picture-in-Picture window.
 *
 * The plugin only opens it from a `visibilitychange` handler that first checks
 * `document.hidden` (src/main/component.tsx), so these build on
 * `tabVisibilityDriver` to simulate the tab going into the background. Once the
 * window is open, Chromium exposes it as an ordinary `about:blank` page on the
 * same BrowserContext, so it can be asserted on like any other page.
 *
 * CAVEAT - undocumented behaviour. The spec requires transient activation for
 * `requestWindow()` (NotAllowedError without it, and it is consumed); a
 * `visibilitychange` handler has none, yet headless Chromium opens the window
 * anyway. Measured on Chrome 149 / Playwright 1.61: `navigator.userActivation`
 * reads true on a page never interacted with. Whether the check passes vacuously
 * or is skipped we cannot tell - only that it is not enforced as written, and
 * nothing guarantees that lasts. `openPipWindow` clicks first
 * (`grantUserActivation`) so a real activation is live if that changes: one click
 * per window, since requestWindow consumes it. If it breaks here the plugin logs
 * a NotAllowedError - not a plugin bug. The faithful trigger, the mediaSession
 * `enterpictureinpicture` action, has no Playwright or CDP equivalent I found.
 */

/**
 * Give the page transient user activation before firing `visibilitychange`.
 * Playwright clicks dispatch trusted input, which grants real activation for
 * ~5s - still live when the handler calls `requestWindow()` synchronously.
 * See the CAVEAT above for why this is insurance rather than a working part.
 *
 * The click lands on a throwaway overlay of our own rather than real client UI:
 * clicking BBB chrome could open menus, and the presentation canvas could draw.
 */
async function grantUserActivation(page: Page): Promise<void> {
  const overlayId = 'pip-test-activation-target';

  await page.evaluate((id) => {
    const overlay = document.createElement('div');
    overlay.id = id;
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '24px',
      height: '24px',
      zIndex: '2147483647',
      background: 'transparent',
    });
    document.body.appendChild(overlay);
  }, overlayId);

  await page.click(`#${overlayId}`);

  const isActive = await page.evaluate((id) => {
    document.getElementById(id)?.remove();
    const { userActivation } = navigator as Navigator & {
      userActivation?: { isActive: boolean };
    };
    return userActivation ? userActivation.isActive : null;
  }, overlayId);

  // Unreachable while Chromium always reports isActive: true - not a working
  // safety net today. null means the API is absent.
  if (isActive === false) {
    throw new Error(
      'Clicking did not produce transient user activation, so the plugin will not be '
      + 'allowed to open its PiP window. navigator.userActivation.isActive was false.',
    );
  }
}

/**
 * Poll the context for the Document PiP window, identified by the `#pip-root`
 * container the plugin creates inside it. Returns the page so callers can assert
 * on what the plugin rendered.
 */
export async function waitForPipPage(
  context: BrowserContext,
  timeout: number = ELEMENT_WAIT_LONGER_TIME,
): Promise<Page> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // eslint-disable-next-line no-restricted-syntax
    for (const candidate of context.pages()) {
      // eslint-disable-next-line no-await-in-loop
      const isPipWindow = await candidate
        .evaluate(() => Boolean(document.getElementById('pip-root')))
        .catch(() => false);
      if (isPipWindow) return candidate;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, LOOP_INTERVAL / 4); });
  }

  throw new Error(
    `Timed out after ${timeout}ms waiting for the Document PiP window (#pip-root). `
    + 'The plugin only opens it when active AND some media is present '
    + '(screenshare, webcam or presentation).',
  );
}

/**
 * Background the tab and wait for the plugin to open its PiP window.
 */
export async function openPipWindow(
  context: BrowserContext,
  page: Page,
  timeout: number = ELEMENT_WAIT_LONGER_TIME,
): Promise<Page> {
  await grantUserActivation(page);
  await setTabHidden(page, true);
  return waitForPipPage(context, timeout);
}

/**
 * Read resolved CSS values off the first element matching `selector` inside the
 * PiP document. Colours come back in the browser's canonical `rgb(r, g, b)`
 * form, so assertions compare against that rather than the source hex.
 */
export async function readComputedStyle(
  pipPage: Page,
  selector: string,
  properties: string[],
): Promise<Record<string, string> | null> {
  return pipPage.evaluate(([sel, props]) => {
    const element = document.querySelector(sel as string);
    if (!element) return null;
    const computed = window.getComputedStyle(element);
    return (props as string[]).reduce<Record<string, string>>((acc, property) => {
      acc[property] = computed.getPropertyValue(property);
      return acc;
    }, {});
  }, [selector, properties] as [string, string[]]);
}

/**
 * The avatar tile belonging to `userName`, matched through its name label.
 * Falls back to nothing when the label is hidden, so callers that shrink the
 * tile below the ResizeObserver threshold must capture the locator first.
 */
export function avatarTileFor(pipPage: Page, userName: string) {
  return pipPage.locator('.pip-avatar-item').filter({ hasText: userName });
}
