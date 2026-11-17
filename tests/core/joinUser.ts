import { Browser, BrowserContext } from '@playwright/test';
import { ELEMENT_WAIT_EXTRA_LONG_TIME } from './constants';
import { generateSettingsData, getJoinURL } from './helpers';
import { SessionPage } from './sessionPage';

export interface JoinExtraUserOptions {
  fullName: string;
  /** Extra `&`-joined query string appended to the /join call, e.g. `avatarURL=...`. */
  joinParameter?: string;
  /** Join the audio conference with the microphone instead of dismissing the modal. */
  joinAudio?: boolean;
  isModerator?: boolean;
}

export interface JoinedUser {
  context: BrowserContext;
  sessionPage: SessionPage;
}

/**
 * Join one extra user into an existing meeting, in its own browser context.
 *
 * The avatar tiles only appear for participants who are NOT sharing a camera,
 * so most of these tests need several such users. `createMultiUserTest` is
 * fixed at one moderator plus one attendee, hence this helper.
 *
 * Two constraints of the BBB join flow are load-bearing here:
 *
 *   - The join token is SINGLE USE. `getJoinURL` mints a fresh checksum on every
 *     call, so each attempt gets its own URL and the page is never reloaded -
 *     a reload would replay a spent token and bounce the user out.
 *   - Navigation waits on `domcontentloaded` plus the `#layout` element, never
 *     on `networkidle`: the client holds long-lived GraphQL subscriptions open,
 *     so the network never goes idle and the wait would hang for minutes.
 */
export async function joinExtraUser(
  browser: Browser,
  meetingID: string,
  options: JoinExtraUserOptions,
): Promise<JoinedUser> {
  const {
    fullName, joinParameter, joinAudio = false, isModerator = false,
  } = options;

  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write', 'camera', 'microphone'],
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const sessionPage = new SessionPage({ browser, page });
  sessionPage.username = fullName;
  sessionPage.meetingId = meetingID;

  const joinUrl = getJoinURL({
    meetingID,
    isModerator,
    joinParameter,
    skipSessionDetailsModal: true,
    fullName,
  });

  await page.goto(joinUrl, { waitUntil: 'domcontentloaded' });
  // Booting a full BBB client is heavy, and these helpers exist to add SEVERAL
  // of them; under parallel workers the plain extra-long wait is not enough.
  await page.waitForSelector('div#layout', { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME * 2 });
  sessionPage.settings = await generateSettingsData(page);

  if (joinAudio) {
    await sessionPage.joinMicrophone();
  } else if (sessionPage.settings?.autoJoinAudioModal) {
    await sessionPage.closeAudioModal();
  }

  return { context, sessionPage };
}

/**
 * Maximum number of clients booted at the same time by `joinExtraUsers`.
 *
 * Joining every user at once is what made the MAX_TILES test flaky: eight full
 * BBB clients starting together, next to another worker's meeting, pushed the
 * `#layout` wait past its timeout. Batching trades a little wall-clock for a
 * run that survives parallel workers.
 */
const JOIN_BATCH_SIZE = 3;

/** Join several extra users and return them in the requested order. */
export async function joinExtraUsers(
  browser: Browser,
  meetingID: string,
  users: JoinExtraUserOptions[],
): Promise<JoinedUser[]> {
  const joined: JoinedUser[] = [];

  for (let index = 0; index < users.length; index += JOIN_BATCH_SIZE) {
    const batch = users.slice(index, index + JOIN_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.all(
      batch.map((user) => joinExtraUser(browser, meetingID, user)),
    );
    joined.push(...settled);
  }

  return joined;
}

/** Close every context opened by `joinExtraUser`/`joinExtraUsers`. */
export async function closeJoinedUsers(joined: JoinedUser[]): Promise<void> {
  await Promise.all(joined.map(({ context }) => context.close()));
}
