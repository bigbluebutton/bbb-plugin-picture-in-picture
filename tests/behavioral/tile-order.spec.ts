import { expect } from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import { ELEMENT_WAIT_EXTRA_LONG_TIME } from '../core/constants';
import { elements as e } from '../elements';
import { openPipWindow } from '../core/pipWindowHelper';
import { closeJoinedUsers, JoinedUser, joinExtraUsers } from '../core/joinUser';
import { createMultiUserTest } from './fixtures';

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

base.describe('mixed tile grid', () => {
  base.describe.configure({ timeout: ELEMENT_WAIT_EXTRA_LONG_TIME * 20 });

  let joined: JoinedUser[] = [];

  base.afterEach(async () => {
    await closeJoinedUsers(joined);
    joined = [];
  });

  base('keeps avatars after webcams and creates no implicit grid rows', async ({ multiUserTest, browser }) => {
    const { modPage, attendeePage } = multiUserTest;

    await modPage.shareWebcam();
    await attendeePage.shareWebcam();
    joined = await joinExtraUsers(browser, modPage.meetingId, [
      { fullName: 'Zulu Avatar' },
      { fullName: 'Alpha Avatar' },
    ]);

    const pipPage = await openPipWindow(modPage.page.context(), modPage.page);

    await expect(pipPage.locator(e.pipWebcams)).toHaveCount(1);
    await expect.poll(() => pipPage.locator(e.pipAvatarItem).count(), {
      timeout: ELEMENT_WAIT_EXTRA_LONG_TIME,
    }).toBe(2);
    await expect.poll(() => pipPage.locator(e.pipVideo).count(), {
      timeout: ELEMENT_WAIT_EXTRA_LONG_TIME,
    }).toBeGreaterThanOrEqual(2);

    const layout = await pipPage.locator(e.pipWebcams).evaluate((grid) => {
      const style = window.getComputedStyle(grid);
      const webcamOrders = Array.from(grid.querySelectorAll('.pip-video-container:not(.pip-avatar-item):not(.pip-slide-item)'))
        .map((tile) => Number(window.getComputedStyle(tile).order));
      const avatarOrders = Array.from(grid.querySelectorAll('.pip-avatar-item'))
        .map((tile) => Number(window.getComputedStyle(tile).order));
      const rowTracks = style.gridTemplateRows.split(' ').filter(Boolean);
      const firstTile = grid.firstElementChild;
      const columnTracks = style.gridTemplateColumns.split(' ').filter(Boolean);
      const expectedRows = firstTile
        ? Math.ceil(grid.children.length / columnTracks.length)
        : 0;

      return {
        avatarOrders,
        webcamOrders,
        rowTracks,
        expectedRows,
      };
    });

    expect(Math.min(...layout.avatarOrders)).toBeGreaterThan(Math.max(...layout.webcamOrders));
    expect(layout.rowTracks).toHaveLength(layout.expectedRows);
    expect(new Set(layout.rowTracks).size).toBe(1);
  });
});
