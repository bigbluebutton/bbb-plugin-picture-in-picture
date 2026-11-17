/**
 * Behavioural tests - multi-user (moderator/presenter + attendee/viewer).
 *
 * The Picture-in-Picture toggle is gated only by browser support for the
 * Document Picture-in-Picture API (isPipSupported), not by the user role, so it
 * is expected to appear for both the moderator and the attendee. These tests use
 * the shared two-context fixture to confirm that.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { expect } from '@playwright/test';
import { createMultiUserTest } from './fixtures';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_EXTRA_LONG_TIME, ELEMENT_WAIT_LONGER_TIME } from '../core/constants';
import { elements as e } from '../elements';
import { SessionPage } from '../core/sessionPage';
import { setTabHidden } from '../core/tabVisibilityDriver';
import { openPipWindow } from '../core/pipWindowHelper';

const PLUGIN_NAME = 'picture-in-picture';
const ENV_VAR_NAME = 'PICTURE_IN_PICTURE_PLUGIN_URL';

const { test, setPluginUrl, getPluginUrl } = createMultiUserTest({ envVarName: ENV_VAR_NAME });

test.beforeAll(checkPluginAvailability({
  pluginName: PLUGIN_NAME,
  setPluginUrl,
  getPluginUrl,
}));

/** Open the options dropdown and return the PiP toggle item locator. */
async function openPipItem(sessionPage: SessionPage) {
  await sessionPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
  const item = sessionPage.page.locator(e.pipActionButton).first();
  if (!(await item.isVisible())) {
    await sessionPage.page.click(e.options);
    await item.waitFor({ state: 'visible', timeout: ELEMENT_WAIT_LONGER_TIME });
  }
  return item;
}

test.describe('Picture-in-Picture Plugin - Behavioural (multi-user)', () => {
  test('should offer the PiP toggle to both the moderator and the attendee', async ({ multiUserTest }) => {
    const { modPage, attendeePage } = multiUserTest;

    const modItem = await openPipItem(modPage);
    await expect(modItem, 'moderator should see the PiP toggle item').toBeVisible();
    await expect(modItem, 'moderator toggle label should mention PiP Window').toContainText('PiP Window');

    const attendeeItem = await openPipItem(attendeePage);
    await expect(attendeeItem, 'attendee should see the PiP toggle item').toBeVisible();
    await expect(attendeeItem, 'attendee toggle label should mention PiP Window').toContainText('PiP Window');
  });

  test('should let the attendee toggle its own PiP state independently of the moderator', async ({ multiUserTest }) => {
    const { modPage, attendeePage } = multiUserTest;

    // Toggle on the attendee side and confirm its own label flips.
    const attendeeItem = await openPipItem(attendeePage);
    const attendeeBefore = (await attendeeItem.textContent())?.trim();
    await attendeeItem.click();
    const attendeeItemAfter = await openPipItem(attendeePage);
    const attendeeAfter = (await attendeeItemAfter.textContent())?.trim();
    expect(attendeeAfter, 'attendee label should flip after clicking its own toggle').not.toBe(attendeeBefore);

    // The moderator's toggle is independent: its label reflects the moderator's
    // own (untouched) state, which defaults to "Deactivate PiP Window".
    const modItem = await openPipItem(modPage);
    const modLabel = (await modItem.textContent())?.trim();
    expect(modLabel, 'moderator toggle should remain in its own default state').toBe('Deactivate PiP Window');
  });

  // ChatNotifier subscribes to the chat stream and raises a toast INSIDE the PiP
  // window. It skips the current user's own messages
  // (msg.senderId !== currentUser.userId), so this needs two users: the attendee
  // sends, the moderator's PiP window must show the toast.
  test('should surface an incoming chat message as a toast inside the PiP window', async ({ multiUserTest }) => {
    const { modPage, attendeePage } = multiUserTest;
    const messageText = `pip-toast-check-${modPage.meetingId}`;

    await modPage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    const pipPage = await openPipWindow(modPage.page.context(), modPage.page);

    await attendeePage.page.waitForSelector(e.whiteboard, { timeout: ELEMENT_WAIT_LONGER_TIME });
    await attendeePage.sendPublicChatMessage(messageText);

    // The toast auto-dismisses 10s after it appears, but toHaveCount polls
    // continuously, so a longer budget only helps: it covers a slow graphql
    // round-trip when several meetings are running in parallel.
    const toast = pipPage.locator(e.pipChatMessage).filter({ hasText: messageText });
    await expect(
      toast,
      'the moderator PiP window should show a toast for the attendee message',
    ).toHaveCount(1, { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME * 2 });

    await setTabHidden(modPage.page, false);
  });
});
