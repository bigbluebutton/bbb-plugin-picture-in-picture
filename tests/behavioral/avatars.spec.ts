/**
 * Behavioural tests - avatar tiles.
 *
 * The plugin fills the leftover cells of its PiP grid with avatar tiles for the
 * participants who are NOT sharing a camera (`isSharingCamera: { _eq: false }`
 * in USERS_SUBSCRIPTION). Each tile shows the user's avatar image, or a coloured
 * circle with the first initial when there is no image or the image fails to
 * load, plus a name label that a ResizeObserver hides once the tile gets narrow.
 *
 * All of that lives inside the Document PiP window, so every assertion here goes
 * through `openPipWindow`.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { expect, Page } from '@playwright/test';
import { checkPluginAvailability } from '../core/fixtures/pluginBeforeAll';
import {
  ELEMENT_WAIT_EXTRA_LONG_TIME,
  ELEMENT_WAIT_LONGER_TIME,
  ELEMENT_WAIT_TIME,
} from '../core/constants';
import { elements as e } from '../elements';
import { setTabHidden } from '../core/tabVisibilityDriver';
import { avatarTileFor, openPipWindow, readComputedStyle } from '../core/pipWindowHelper';
import { closeJoinedUsers, JoinedUser, joinExtraUsers } from '../core/joinUser';
import { server } from '../core/parameters';
import { createMultiUserTest } from './fixtures';

const PLUGIN_NAME = 'picture-in-picture';
const ENV_VAR_NAME = 'PICTURE_IN_PICTURE_PLUGIN_URL';

// Both avatar URLs are served by the BBB host itself rather than mocked.
//
// An earlier version fulfilled them with `context.route`, which did NOT work:
// the <img> rendered with the right src but never decoded (naturalWidth stayed
// 0), because the request is issued from the Document PiP window and the
// context route did not intercept it. Same-origin real URLs sidestep the
// question entirely - and the 404 case becomes a genuine server 404 rather than
// a simulated one, which is a truer exercise of the onError fallback.
//
// `/html5client/resources/images/avatar.png` is the default avatar shipped in
// bigbluebutton-html5/public/resources/images, so it is present on any server.
const bbbOrigin = server ? new URL(server).origin : '';
const AVATAR_OK_URL = `${bbbOrigin}/html5client/resources/images/avatar.png`;
const AVATAR_MISSING_URL = `${bbbOrigin}/html5client/resources/images/pip-tests-missing-avatar.png`;

const {
  test: base, setPluginUrl, getPluginUrl,
} = createMultiUserTest({ envVarName: ENV_VAR_NAME });

base.beforeAll(checkPluginAvailability({
  pluginName: PLUGIN_NAME,
  setPluginUrl,
  getPluginUrl,
}));

/** Wait until the PiP grid has rendered an avatar tile for `userName`. */
async function waitForAvatarTile(pipPage: Page, userName: string) {
  const tile = avatarTileFor(pipPage, userName);
  await expect(
    tile,
    `an avatar tile should render for ${userName}`,
  ).toHaveCount(1, { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME });
  return tile;
}

base.describe('Picture-in-Picture Plugin - Behavioural (avatar tiles)', () => {
  // Each test boots the two fixture clients plus its own extra users, and the
  // talking one negotiates audio on top of that. The default per-test budget is
  // tight for that once workers run in parallel.
  base.describe.configure({ timeout: ELEMENT_WAIT_EXTRA_LONG_TIME * 10 });

  let joined: JoinedUser[] = [];

  base.afterEach(async () => {
    await closeJoinedUsers(joined);
    joined = [];
  });

  // ── 2. avatar-tile-renders ────────────────────────────────────────────────
  base('should render a camera-less user as an initial-plus-colour tile with a visible name', async ({ multiUserTest, browser }) => {
    const { modPage } = multiUserTest;
    const userName = 'Zoe Avatarless';

    joined = await joinExtraUsers(browser, modPage.meetingId, [{ fullName: userName }]);

    const pipPage = await openPipWindow(modPage.page.context(), modPage.page);
    const tile = await waitForAvatarTile(pipPage, userName);

    // No avatarURL was passed, so the plugin falls back to the coloured circle.
    const circle = tile.locator(e.pipAvatarCircle);
    await expect(circle, 'the tile should fall back to the initial circle').toHaveCount(1);
    await expect(
      circle,
      'the circle should carry the first letter of the display name',
    ).toHaveText(userName.charAt(0));
    await expect(
      tile.locator('img'),
      'no avatar image should be rendered when the user has no avatarURL',
    ).toHaveCount(0);

    // The colour comes from `user.color`, applied inline; assert it resolved to
    // an actual colour rather than checking a specific value the server picks.
    const backgroundColor = await circle.evaluate(
      (node) => window.getComputedStyle(node).backgroundColor,
    );
    expect(
      backgroundColor,
      'the circle should be painted with the user colour from the subscription',
    ).toMatch(/^rgba?\(/);
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

    // At the default 1280x720 viewport the tiles are comfortably wider than the
    // 140px ResizeObserver threshold, so the name must be showing.
    const width = await tile.evaluate((node) => node.getBoundingClientRect().width);
    expect(width, 'the tile should be at least 140px wide in this layout').toBeGreaterThanOrEqual(140);
    await expect(
      tile.locator('.username'),
      'the name label should be visible on a tile wider than 140px',
    ).toHaveText(userName);

    await setTabHidden(modPage.page, false);
  });

  // ── 3. avatar-name-visibility (ResizeObserver) ────────────────────────────
  base('should hide the name below 140px and bring it back above the threshold', async ({ multiUserTest, browser }) => {
    const { modPage } = multiUserTest;
    const userName = 'Nina Narrow';

    joined = await joinExtraUsers(browser, modPage.meetingId, [{ fullName: userName }]);

    const pipPage = await openPipWindow(modPage.page.context(), modPage.page);
    const tile = await waitForAvatarTile(pipPage, userName);

    await expect(tile.locator('.username'), 'the name should start out visible').toBeVisible();

    // Measure through an element HANDLE, not through the locator.
    //
    // `avatarTileFor` filters on `hasText: userName`, so the moment the label is
    // hidden the tile stops matching its own locator and `locator.evaluate`
    // starts throwing instead of returning a small width - the poll below could
    // then never observe `< 140` and would always time out. It only appeared to
    // work at low worker counts, where the first poll sample happened to land in
    // the gap between the width changing and React committing the removal.
    //
    // The handle points at the DOM node itself and stays valid across the
    // re-render (the tile keeps its `avatar-${userId}` key; only the child span
    // goes away), so it can be measured whether or not the name is showing.
    const tileHandle = await tile.elementHandle();
    if (!tileHandle) throw new Error(`could not resolve the avatar tile for ${userName}`);

    const tileWidth = () => tileHandle.evaluate(
      (node: Element) => node.getBoundingClientRect().width,
    );
    const labelCount = () => tileHandle.evaluate(
      (node: Element) => node.querySelectorAll('.username').length,
    );

    // The tile is squeezed by constraining the grid itself, NOT by resizing the
    // PiP window. Two reasons:
    //
    //   - `page.setViewportSize` on a Document PiP window proved unreliable:
    //     it worked with one or two workers and stopped taking effect at four,
    //     leaving the cell at its original width until the poll timed out.
    //   - Even when it did work, the resulting cell width depends on how many
    //     cells `findOptimalGrid` is laying out. At exactly two cells a 320x240
    //     window resolves to two columns of ~149px - ABOVE the threshold - so
    //     the test also raced the avatar subscription.
    //
    // Overriding the grid width removes both variables. The unit under test is
    // the ResizeObserver and its 140px threshold, and it observes the TILE, so
    // driving the tile's width directly exercises exactly that. `!important`
    // is needed because the component sets the grid width inline from
    // `optimalGrid`, and React re-applies it on every render.
    const SQUEEZE_STYLE_ID = 'pip-test-squeeze';
    const squeeze = (id: string) => {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = '#plugin-pip-webcams {'
        + ' width: 120px !important;'
        + ' grid-template-columns: 1fr !important;'
        + ' }';
      document.head.appendChild(style);
    };
    const release = (id: string) => document.getElementById(id)?.remove();

    await pipPage.evaluate(squeeze, SQUEEZE_STYLE_ID);
    await expect
      .poll(tileWidth, {
        timeout: ELEMENT_WAIT_LONGER_TIME,
        message: 'the tile should shrink below the 140px threshold',
      })
      .toBeLessThan(140);
    await expect
      .poll(labelCount, {
        timeout: ELEMENT_WAIT_TIME,
        message: 'the ResizeObserver should drop the name once the tile is narrower than 140px',
      })
      .toBe(0);

    // Growing it back must restore the label - the observer is not one-shot.
    await pipPage.evaluate(release, SQUEEZE_STYLE_ID);
    await expect
      .poll(tileWidth, {
        timeout: ELEMENT_WAIT_LONGER_TIME,
        message: 'the tile should grow back over the 140px threshold',
      })
      .toBeGreaterThanOrEqual(140);
    await expect(
      tile.locator('.username'),
      'the name should come back once the tile is wide again',
    ).toHaveText(userName, { timeout: ELEMENT_WAIT_TIME });

    await setTabHidden(modPage.page, false);
  });

  // ── 4. avatar-image ───────────────────────────────────────────────────────
  base('should render a valid avatarURL as an image and fall back to the initial when it 404s', async ({ multiUserTest, browser }) => {
    const { modPage } = multiUserTest;
    const withImage = 'Iris Image';
    const withBrokenImage = 'Bruno Broken';

    const modContext = modPage.page.context();

    // `avatarURL` is a /join parameter of the BBB API - NOT a userdata- key.
    joined = await joinExtraUsers(browser, modPage.meetingId, [
      { fullName: withImage, joinParameter: `avatarURL=${encodeURIComponent(AVATAR_OK_URL)}` },
      { fullName: withBrokenImage, joinParameter: `avatarURL=${encodeURIComponent(AVATAR_MISSING_URL)}` },
    ]);

    const pipPage = await openPipWindow(modContext, modPage.page);

    const okTile = await waitForAvatarTile(pipPage, withImage);
    const okImage = okTile.locator('img');
    await expect(okImage, 'a valid avatarURL should render as an image').toHaveCount(1);
    await expect(okImage).toHaveAttribute('src', AVATAR_OK_URL);
    await expect(
      okTile.locator(e.pipAvatarCircle),
      'no initial circle should be rendered while the image loads fine',
    ).toHaveCount(0);
    // `naturalWidth > 0` is the only proof the bytes actually decoded.
    await expect
      .poll(
        () => okImage.evaluate((node: HTMLImageElement) => node.naturalWidth),
        { timeout: ELEMENT_WAIT_LONGER_TIME, message: 'the avatar image should decode' },
      )
      .toBeGreaterThan(0);

    // The broken one must swap to the fallback through the onError handler.
    const brokenTile = await waitForAvatarTile(pipPage, withBrokenImage);
    const brokenCircle = brokenTile.locator(e.pipAvatarCircle);
    await expect(
      brokenCircle,
      'a 404 avatarURL should fall back to the initial circle via onError',
    ).toHaveCount(1, { timeout: ELEMENT_WAIT_LONGER_TIME });
    await expect(brokenCircle).toHaveText(withBrokenImage.charAt(0));
    await expect(
      brokenTile.locator('img'),
      'the broken image element should be removed once it failed',
    ).toHaveCount(0);

    const backgroundColor = await brokenCircle.evaluate(
      (node) => window.getComputedStyle(node).backgroundColor,
    );
    expect(backgroundColor, 'the fallback circle should still carry the user colour').toMatch(/^rgba?\(/);
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

    await setTabHidden(modPage.page, false);
  });

  // ── 5. talking-indicator ──────────────────────────────────────────────────
  // On BBB 3.0 the source of truth is `user_voice.talking`: the audio floor is
  // never set on the mediasoup transport, so `lastFloorTime` stays put and only
  // `talking` moves. The plugin reads exactly that field.
  base('should mark only the talking user with the talking class, border and pulse', async ({ multiUserTest, browser }) => {
    const { modPage } = multiUserTest;
    const talker = 'Tania Talker';
    const silent = 'Simon Silent';

    joined = await joinExtraUsers(browser, modPage.meetingId, [
      // The fake device feeds a continuous tone, so this user talks constantly.
      { fullName: talker, joinAudio: true },
      { fullName: silent },
    ]);

    const pipPage = await openPipWindow(modPage.page.context(), modPage.page);

    const talkerTile = await waitForAvatarTile(pipPage, talker);
    const silentTile = await waitForAvatarTile(pipPage, silent);

    await expect(
      talkerTile,
      'the talking user tile should pick up the talking class',
    ).toHaveClass(/talking/, { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME });

    const talkerStyle = await readComputedStyle(
      pipPage,
      '.pip-avatar-item.talking',
      ['border-top-color'],
    );
    expect(
      talkerStyle?.['border-top-color'],
      'the talking tile should switch its border to the highlight blue',
    ).toBe('rgb(59, 130, 246)');

    // The user has no avatar image, so the pulse runs on the initial circle,
    // which uses the outward `avatar-pulse` keyframes.
    const animationName = await talkerTile
      .locator(e.pipAvatarCircle)
      .evaluate((node) => window.getComputedStyle(node).animationName);
    expect(animationName, 'the talking tile should run the avatar-pulse animation').toBe('avatar-pulse');

    // Negative control: the silent participant must stay untouched.
    await expect(
      silentTile,
      'the silent user tile should not carry the talking class',
    ).not.toHaveClass(/talking/);
    const silentAnimation = await silentTile
      .locator(e.pipAvatarCircle)
      .evaluate((node) => window.getComputedStyle(node).animationName);
    expect(silentAnimation, 'the silent tile should not animate').toBe('none');

    await setTabHidden(modPage.page, false);
  });
});
