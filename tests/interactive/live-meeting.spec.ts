/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
/**
 * Interactive live-meeting driver — this is a *session*, not a test.
 *
 * It creates a meeting with the plugin loaded, prints a moderator join URL for
 * a human to open in their own browser, then joins N bot attendees (6 by
 * default, all with distinct names) that share the synthetic webcam supplied by
 * Chromium's `--use-fake-device-for-media-stream`. One of the bots keeps the
 * meeting noisy by posting a public chat message on a fixed interval.
 *
 * The first three bots also join audio unmuted and beep on their own slot of a
 * shared 10 s cycle (offsets 0 s / 4 s / 6 s by default, each on its own pitch),
 * so there is always someone talking and the active-speaker machinery has
 * something to switch between. See `beepDriver.ts` for how the beep gets into
 * the microphone.
 *
 * It lives under `tests/interactive/`, which `playwright.config.ts` excludes
 * from `npm test`: it never asserts anything and it deliberately hangs around
 * for as long as you configured it to.
 *
 *   npm run live-meeting                       # 6 attendees, chat every 30s, 60 min
 *   LIVE_ATTENDEES=3 npm run live-meeting      # fewer bots
 *   LIVE_DURATION_MIN=0 npm run live-meeting   # run until Ctrl+C
 *   npm run live-meeting -- --headed           # watch the bots' browsers
 *
 * Nothing here calls `/api/end`, so the meeting lingers on the server until it
 * times out after the last user leaves.
 */
import {
  test, Browser, BrowserContext, APIRequestContext, Page,
} from '@playwright/test';
import * as parameters from '../core/parameters';
import { server } from '../core/parameters';
import {
  createMeeting, encodeCustomParams, generateSettingsData, getJoinURL,
} from '../core/helpers';
import { SessionPage } from '../core/sessionPage';
import { coreElements as e } from '../core/coreElements';
import { ELEMENT_WAIT_EXTRA_LONG_TIME } from '../core/constants';
import { installSyntheticMicrophone, readBeepCount, startBeeping } from './beepDriver';

const PLUGIN_NAME = 'picture-in-picture';

/** Pool the bot names are taken from, in order. */
const ATTENDEE_NAMES = [
  'Alice Johnson',
  'Bruno Costa',
  'Carla Mendes',
  'Daniel Ruiz',
  'Elena Petrova',
  'Felipe Souza',
  'Greta Novak',
  'Hiroshi Tanaka',
];

const ATTENDEE_COUNT = Number(process.env.LIVE_ATTENDEES) || 6;
const CHAT_INTERVAL_MS = (Number(process.env.LIVE_CHAT_INTERVAL_SEC) || 30) * 1000;
/** 0 means "run until the process is killed". */
const DURATION_MIN = process.env.LIVE_DURATION_MIN !== undefined
  ? Number(process.env.LIVE_DURATION_MIN)
  : 60;
const MODERATOR_NAME = process.env.LIVE_MODERATOR_NAME || 'Moderator';
const WITH_PLUGIN = process.env.LIVE_WITH_PLUGIN !== 'false';
const SHARE_WEBCAM = process.env.LIVE_WEBCAM !== 'false';

// ── Beeps ───────────────────────────────────────────────────────────────────
const MIC_COUNT = Math.min(
  process.env.LIVE_MIC_USERS !== undefined ? Number(process.env.LIVE_MIC_USERS) : 3,
  ATTENDEE_COUNT,
);
const BEEP_INTERVAL_MS = (Number(process.env.LIVE_BEEP_INTERVAL_SEC) || 10) * 1000;
const BEEP_DURATION_MS = Number(process.env.LIVE_BEEP_DURATION_MS) || 400;
const BEEP_VOLUME = Number(process.env.LIVE_BEEP_VOLUME) || 0.6;
/** Lead time before the first beep, so every bot's timer is armed by then. */
const BEEP_START_LEAD_MS = 3000;
/**
 * Join parameters for the beeping bots, so their audio flow does not depend on
 * how the target server is configured. Each one overrides the matching
 * `settings.yml` key per user (the client JSON-parses userdata, so `=false`
 * really is `false`):
 *   - auto_join_audio   : the client starts the audio flow by itself on join;
 *   - listen_only_mode  : off, which also removes the device-choice screen;
 *   - force_listen_only : off, or viewers would be barred from the microphone;
 *   - skip_check_audio  : no echo test.
 * The result is the same short path on every server — the one a LiveKit meeting
 * already forces, since `audio-modal/container.jsx` disables listen-only there.
 */
const MICROPHONE_JOIN_PARAMETERS = [
  'userdata-bbb_auto_join_audio=true',
  'userdata-bbb_listen_only_mode=false',
  'userdata-bbb_force_listen_only=false',
  'userdata-bbb_skip_check_audio=true',
].join('&');

/** One pitch per beeping bot, so a listener can tell them apart by ear. */
const BEEP_FREQUENCIES_HZ = [660, 880, 1175, 990, 1320, 1480];
const DEFAULT_BEEP_OFFSETS_SEC = [0, 4, 6];

/**
 * Each beeping bot fires once per cycle, on its own slot. The default 0/4/6
 * pattern is deliberately uneven — it is easier to follow by ear than an evenly
 * spaced one — but any other count falls back to even spacing.
 */
function resolveBeepOffsetsMs(count: number): number[] {
  const configured = process.env.LIVE_BEEP_OFFSETS;
  if (configured) {
    return configured.split(',').map((value) => Number(value.trim()) * 1000);
  }
  if (count === DEFAULT_BEEP_OFFSETS_SEC.length) {
    return DEFAULT_BEEP_OFFSETS_SEC.map((value) => value * 1000);
  }
  return Array.from(
    { length: count },
    (_, index) => Math.round((index * BEEP_INTERVAL_MS) / count),
  );
}

interface Bot {
  context: BrowserContext;
  sessionPage: SessionPage;
  hasMicrophone: boolean;
}

function banner(lines: string[]) {
  const width = Math.max(...lines.map((line) => line.length));
  console.log(`\n┌${'─'.repeat(width + 2)}┐`);
  lines.forEach((line) => console.log(`│ ${line.padEnd(width)} │`));
  console.log(`└${'─'.repeat(width + 2)}┘\n`);
}

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(message: string) {
  console.log(`[${stamp()}] ${message}`);
}

/**
 * Resolve the plugin manifest URL the same way the behavioural suites do, but
 * without failing the session when it is missing: a live meeting is still
 * useful with the stock client, so an unreachable manifest is only a warning.
 */
async function resolvePluginUrl(request: APIRequestContext): Promise<string | undefined> {
  if (!WITH_PLUGIN) return undefined;

  const fromEnv = process.env.PICTURE_IN_PICTURE_PLUGIN_URL;
  if (fromEnv) return fromEnv;

  const pluginUrl = `${new URL(server as string).origin}/plugins/${PLUGIN_NAME}/dist/manifest.json`;
  try {
    const response = await request.get(pluginUrl);
    if (!response.ok()) {
      log(`WARN  plugin manifest not reachable at ${pluginUrl} (HTTP ${response.status()}) — joining without the plugin.`);
      log('WARN  build and deploy it (npm run build-bundle && npm run publish-plugin:dev) or set PICTURE_IN_PICTURE_PLUGIN_URL.');
      return undefined;
    }
    await response.json();
    return pluginUrl;
  } catch (error) {
    log(`WARN  could not fetch ${pluginUrl} (${error}) — joining without the plugin.`);
    return undefined;
  }
}

/**
 * What the client has open on top of the page. Joins fail against unfamiliar
 * servers mostly because some modal is in the way, and the Playwright error
 * only says "an overlay intercepts pointer events" — never which one.
 */
async function describeOpenModals(page: Page): Promise<string> {
  try {
    const names = await page.evaluate(() => Array.from(
      document.querySelectorAll('#modals-container [data-test]'),
    ).map((element) => element.getAttribute('data-test')).filter(Boolean));
    return names.length ? names.join(', ') : 'none';
  } catch {
    return 'unknown';
  }
}

/**
 * Join one bot attendee into an existing meeting, share its webcam, and — for
 * the beeping ones — join audio unmuted with the synthetic microphone.
 */
async function joinBot(
  browser: Browser,
  meetingId: string,
  name: string,
  hasMicrophone: boolean,
): Promise<Bot> {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 1024, height: 768 },
  });
  // Before the first navigation: the client reads navigator.mediaDevices early.
  if (hasMicrophone) await installSyntheticMicrophone(context);
  const page = await context.newPage();
  const sessionPage = new SessionPage({ browser, page });
  sessionPage.username = name;
  sessionPage.meetingId = meetingId;

  const joinUrl = getJoinURL({
    meetingID: meetingId,
    isModerator: false,
    skipSessionDetailsModal: true,
    fullName: name,
    joinParameter: hasMicrophone ? MICROPHONE_JOIN_PARAMETERS : undefined,
  });

  try {
    await page.goto(joinUrl);
    await page.waitForSelector('div#layout', { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME });
    sessionPage.settings = await generateSettingsData(page);

    if (hasMicrophone) {
      // Audio first: the modal is already up, and the webcam flow would have to
      // dismiss it anyway.
      await sessionPage.joinMicrophone();
    } else {
      // The silent bots stay out of audio; they only have to get whatever the
      // client opened on join out of the way.
      await sessionPage.dismissOpenModals();
    }

    if (SHARE_WEBCAM) {
      await sessionPage.shareWebcam();
    }
  } catch (error) {
    log(`WARN  ${name}: modals open when the join failed: ${await describeOpenModals(page)}`);
    // Otherwise a failed bot leaves its browser context running for the whole
    // session.
    await context.close().catch(() => {});
    throw error;
  }

  return { context, sessionPage, hasMicrophone };
}

/**
 * Non-fatal check that the beeps actually reach the conference: the talking
 * indicator is driven by the voice-activity state the server reports, so it
 * only lights up if audio really made it out of the bot and back down to
 * another client.
 */
async function confirmBeepsAreAudible(observer: SessionPage, timeout: number): Promise<void> {
  const talking = observer.getLocator(e.isTalking).first();
  try {
    await talking.waitFor({ state: 'visible', timeout });
    const label = (await talking.textContent())?.trim();
    log(`talking indicator lit up on ${observer.username}'s client (${label}) — the beeps are reaching the conference.`);
  } catch {
    log(`WARN  no talking indicator on ${observer.username}'s client within ${Math.round(timeout / 1000)}s — the beeps may not be reaching the audio bridge.`);
  }
}

test.use({ video: 'off', trace: 'off', screenshot: 'off' });

test('live meeting with bot attendees', async ({ browser, request }) => {
  // The whole point of this file is to outlive any test timeout.
  test.setTimeout(0);

  if (!parameters.server || !parameters.secret) {
    throw new Error('BBB_URL and BBB_SECRET must be set in .env before running the live meeting.');
  }

  const beepOffsetsMs = resolveBeepOffsetsMs(MIC_COUNT);
  const micCount = Math.min(MIC_COUNT, beepOffsetsMs.length);

  const pluginUrl = await resolvePluginUrl(request);
  const createParameter = pluginUrl
    ? encodeCustomParams(`pluginManifests=${JSON.stringify([{ url: pluginUrl }])}`)
    : undefined;

  const meetingId = await createMeeting({ ...parameters }, createParameter);
  const moderatorUrl = getJoinURL({
    meetingID: meetingId,
    isModerator: true,
    skipSessionDetailsModal: true,
    fullName: MODERATOR_NAME,
  });

  // Printed before the bots join so the meeting can be entered while they ramp up.
  banner([
    'MODERATOR JOIN URL — open this in your browser:',
    '',
    moderatorUrl,
    '',
    `meeting ID : ${meetingId}`,
    `plugin     : ${pluginUrl || 'not loaded'}`,
    `attendees  : ${ATTENDEE_COUNT} (webcam ${SHARE_WEBCAM ? 'on' : 'off'})`,
    `microphone : ${micCount} unmuted, beeping every ${BEEP_INTERVAL_MS / 1000}s`,
    `beep slots : ${beepOffsetsMs.slice(0, micCount).map((value) => `${value / 1000}s`).join(' / ')}`,
    `chat       : every ${CHAT_INTERVAL_MS / 1000}s`,
    `duration   : ${DURATION_MIN > 0 ? `${DURATION_MIN} min` : 'until Ctrl+C'}`,
  ]);

  const names = Array.from(
    { length: ATTENDEE_COUNT },
    (_, index) => ATTENDEE_NAMES[index % ATTENDEE_NAMES.length]
      + (index >= ATTENDEE_NAMES.length ? ` ${Math.floor(index / ATTENDEE_NAMES.length) + 1}` : ''),
  );

  const bots: Bot[] = [];
  // Sequential on purpose: six simultaneous joins plus six webcam negotiations
  // is enough to make a modest server drop one of them.
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    try {
      const withMicrophone = index < micCount;
      // eslint-disable-next-line no-await-in-loop
      const bot = await joinBot(browser, meetingId, name, withMicrophone);
      bots.push(bot);
      log(`joined ${name} (${bots.length}/${names.length})${withMicrophone ? ' — microphone unmuted' : ''}`);
    } catch (error) {
      log(`ERROR ${name} failed to join: ${error}`);
    }
  }

  if (!bots.length) {
    throw new Error('No bot attendee managed to join the meeting — check the server logs.');
  }

  // One shared anchor, so the offsets describe slots of the same cycle even
  // though the bots joined minutes apart.
  const micBots = bots.filter((bot) => bot.hasMicrophone);
  const anchorEpochMs = Date.now() + BEEP_START_LEAD_MS;
  await Promise.all(micBots.map((bot, index) => startBeeping(bot.sessionPage.page, {
    anchorEpochMs,
    intervalMs: BEEP_INTERVAL_MS,
    offsetMs: beepOffsetsMs[index],
    frequencyHz: BEEP_FREQUENCIES_HZ[index % BEEP_FREQUENCIES_HZ.length],
    durationMs: BEEP_DURATION_MS,
    volume: BEEP_VOLUME,
  })));
  micBots.forEach((bot, index) => log(
    `${bot.sessionPage.username} beeps at +${beepOffsetsMs[index] / 1000}s of every `
    + `${BEEP_INTERVAL_MS / 1000}s cycle `
    + `(${BEEP_FREQUENCIES_HZ[index % BEEP_FREQUENCIES_HZ.length]} Hz).`,
  ));

  const sender = bots[0].sessionPage;
  log(`${sender.username} will post a public chat message every ${CHAT_INTERVAL_MS / 1000}s.`);

  if (micBots.length) {
    // Prefer a silent bot as the observer: it proves the audio came back down
    // from the server rather than being echoed locally.
    const observer = bots.find((bot) => !bot.hasMicrophone) || micBots[0];
    const beepWaitMs = BEEP_INTERVAL_MS + ELEMENT_WAIT_EXTRA_LONG_TIME;
    await confirmBeepsAreAudible(observer.sessionPage, beepWaitMs);
  }

  banner(['Meeting is live. Join as moderator with the URL above. Press Ctrl+C to tear it down.']);

  const endAt = DURATION_MIN > 0 ? Date.now() + DURATION_MIN * 60 * 1000 : Number.POSITIVE_INFINITY;
  let messageCount = 0;

  while (Date.now() < endAt) {
    messageCount += 1;
    const message = `[${stamp()}] ${sender.username} — automated message #${messageCount}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      await sender.sendPublicChatMessage(message);
      // eslint-disable-next-line no-await-in-loop
      const beeps = await Promise.all(micBots.map(async (bot) => {
        const count = await readBeepCount(bot.sessionPage.page);
        return `${bot.sessionPage.username.split(' ')[0]}=${count ?? '?'}`;
      }));
      log(`chat #${messageCount} sent${beeps.length ? ` | beeps ${beeps.join(' ')}` : ''}`);
    } catch (error) {
      log(`WARN  chat #${messageCount} failed: ${error}`);
    }

    const alive = bots.filter((bot) => !bot.sessionPage.page.isClosed()).length;
    if (alive !== bots.length) {
      log(`WARN  ${bots.length - alive} of ${bots.length} bot pages are gone.`);
    }

    if (Date.now() + CHAT_INTERVAL_MS >= endAt) break;
    // eslint-disable-next-line no-await-in-loop
    await sender.page.waitForTimeout(CHAT_INTERVAL_MS);
  }

  log(`Session finished after ${messageCount} chat messages. Closing the bots.`);
  await Promise.all(bots.map((bot) => bot.context.close().catch(() => {})));
  log('The meeting itself was not ended — the server will time it out once everyone leaves.');
});
