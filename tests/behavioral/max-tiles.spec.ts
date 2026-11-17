/**
 * Behavioural test - the MAX_TILES ceiling on the PiP grid.
 *
 * Regression for the bug where the free-slot count was measured against the
 * webcam count alone, so the presentation/screenshare cell did not consume a
 * slot and the grid could close one cell over the promised ceiling of 10.
 *
 * WHY THIS TEST NEEDS TEN USERS
 * -----------------------------
 * The two formulas are
 *     before: freeSlots = MAX_TILES - webcamCount
 *     after:  freeSlots = MAX_TILES - streams.length
 * and they differ by exactly the number of content cells, i.e. by 1 when a
 * presentation is showing. To SEE that difference the avatar supply has to
 * saturate the pre-fix allowance, which needs
 *     webcamCount + (MAX_TILES - webcamCount) = MAX_TILES
 * participants - ten, whatever the webcam split. Sharing webcams does not lower
 * the count, it only makes each join more expensive, so the cheapest shape is
 * ten camera-less users with the default presentation on screen:
 *     before: 1 slide + 10 avatars = 11 cells  (over the ceiling)
 *     after:  1 slide +  9 avatars = 10 cells
 *
 * That makes this the slowest test in the suite by a wide margin. It is kept in
 * its own file so it can be excluded with `--grep-invert` when a quick run is
 * wanted.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { expect } from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_EXTRA_LONG_TIME } from '../core/constants';
import { elements as e } from '../elements';
import { setTabHidden } from '../core/tabVisibilityDriver';
import { openPipWindow } from '../core/pipWindowHelper';
import { closeJoinedUsers, JoinedUser, joinExtraUsers } from '../core/joinUser';
import { createMultiUserTest } from './fixtures';
import { MAX_TILES } from '../../src/plugin-pip/components/streams/utils';

const PLUGIN_NAME = 'picture-in-picture';
const ENV_VAR_NAME = 'PICTURE_IN_PICTURE_PLUGIN_URL';

const {
  test: base, setPluginUrl, getPluginUrl,
} = createMultiUserTest({ envVarName: ENV_VAR_NAME });

base.beforeAll(checkPluginAvailability({
  pluginName: PLUGIN_NAME,
  setPluginUrl,
  getPluginUrl,
}));

base.describe('Picture-in-Picture Plugin - Behavioural (MAX_TILES ceiling)', () => {
  // Ten client joins plus a PiP window; the default per-test timeout is not
  // enough even with the multiplier.
  base.describe.configure({ timeout: ELEMENT_WAIT_EXTRA_LONG_TIME * 20 });

  let joined: JoinedUser[] = [];

  base.afterEach(async () => {
    await closeJoinedUsers(joined);
    joined = [];
  });

  base('should never render more than MAX_TILES cells, counting the presentation', async ({ multiUserTest, browser }) => {
    const { modPage } = multiUserTest;

    // The fixture already provides two camera-less users (moderator + attendee),
    // so eight more make ten. None of them shares a camera, so all ten are
    // avatar candidates and the default presentation supplies the content cell.
    const fillerCount = MAX_TILES - 2;
    joined = await joinExtraUsers(
      browser,
      modPage.meetingId,
      Array.from({ length: fillerCount }, (_unused, index) => ({
        fullName: `Filler ${String(index + 1).padStart(2, '0')}`,
      })),
    );

    const pipPage = await openPipWindow(modPage.page.context(), modPage.page);

    await expect(
      pipPage.locator(e.pipWebcams),
      'the grid should render inside the PiP window',
    ).toHaveCount(1);

    // The avatar subscription is capped at MAX_TILES server-side and the client
    // trims further, so wait for the grid to settle rather than sampling once.
    const countTiles = () => pipPage.locator(e.pipTile).count();
    await expect
      .poll(countTiles, {
        timeout: ELEMENT_WAIT_EXTRA_LONG_TIME,
        message: 'the grid should fill up once every participant has joined',
      })
      .toBeGreaterThan(1);

    // Give the subscription room to deliver every one of the ten users before
    // taking the measurement that matters.
    await expect
      .poll(countTiles, {
        timeout: ELEMENT_WAIT_EXTRA_LONG_TIME,
        message: `the grid must never exceed ${MAX_TILES} cells`,
      })
      .toBeLessThanOrEqual(MAX_TILES);

    const tileCount = await countTiles();
    const contentCells = await pipPage.locator(e.pipSlideItem).count();
    const avatarCells = await pipPage.locator(e.pipAvatarItem).count();

    expect(
      contentCells,
      'the presentation should occupy a cell, which is what the old formula ignored',
    ).toBe(1);
    expect(
      contentCells + avatarCells,
      'every cell should be either the presentation or an avatar in this setup',
    ).toBe(tileCount);
    expect(
      tileCount,
      `presentation + avatars must fit within MAX_TILES (${MAX_TILES}); `
      + 'the pre-fix formula released one slot too many and closed at 11',
    ).toBeLessThanOrEqual(MAX_TILES);

    await setTabHidden(modPage.page, false);
  });
});
