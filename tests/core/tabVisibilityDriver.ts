import { BrowserContext, Page } from '@playwright/test';

declare global {
  interface Window {
    testTabHidden?: boolean;
  }
}

/**
 * Headless Chromium gives us no way to genuinely background a tab:
 *
 *   - `page.bringToFront()` on a second page does NOT flip `document.hidden`;
 *     it stays `false` and no `visibilitychange` fires.
 *   - `Emulation.setPageVisibilityOverride` was removed from the DevTools
 *     protocol - it is absent in Chrome 149, which Playwright 1.61 ships.
 *
 * So we override the `document.hidden` / `document.visibilityState` getters
 * behind a flag we can flip at will, and fire the event ourselves. Neither half
 * works alone: a synthetic event leaves `document.hidden` at `false`, so any
 * handler guarded on it does nothing, and flipping the flag fires no event.
 *
 * Must be called on the context BEFORE any page navigates, so the override is in
 * place by the time the page under test registers its listener.
 */
export async function installVisibilityOverride(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.testTabHidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => window.testTabHidden === true,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (window.testTabHidden === true ? 'hidden' : 'visible'),
    });
  });
}

/**
 * Flip the simulated tab visibility and fire `visibilitychange`, exactly as the
 * browser would. Requires `installVisibilityOverride` on the context.
 */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    window.testTabHidden = isHidden;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
