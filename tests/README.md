# Picture-in-Picture Plugin – Automated Tests

End-to-end tests for the **Picture-in-Picture Plugin** written with [Playwright](https://playwright.dev/).
The shared test infrastructure lives inside `tests/core/` and mirrors the layout used by the other
BigBlueButton plugins.

Unit tests (vitest) live under `tests/unit/` and are documented separately – run them with
`npm run test:unit`. Playwright ignores that folder (`testIgnore`).

---

## How to run the tests

### 1 – Install dependencies

From the **plugin root**:

```bash
npm install
npx playwright install --with-deps chromium
```

### 2 – Configure environment variables

```bash
cp .env.template .env
# edit .env and set BBB_URL and BBB_SECRET
```

| Variable | Required | Description |
|----------|----------|-------------|
| `BBB_URL` | **yes** | Full API URL, e.g. `https://bbb.example.com/bigbluebutton/` |
| `BBB_SECRET` | **yes** | Shared secret of the BBB server |
| `PICTURE_IN_PICTURE_PLUGIN_URL` | no | Direct URL to `manifest.json`; auto-detected from the server otherwise |
| `LOCAL_CONTAINER_NAME` | no | Docker container name for the local deployment script |
| `TIMEOUT_MULTIPLIER` | no | Multiply all timeouts (default 1 locally, 2 in CI) |
| `CI` | no | `"true"` enables CI reporter and single-worker mode |
| `TEST_MEETINGS` | no | Set to `"isolated"` to give each test its own meeting (see [Meeting isolation](#meeting-isolation)) |

### 3 – Build and deploy the plugin

```bash
npm run build-bundle
```

Then serve the plugin so the target BBB server can access it. To deploy into a local BBB Docker
container:

```bash
npm run publish-plugin:dev
```

---

## Running the tests

```bash
# All suites – shared meetings (default)
npm test

# All suites – one meeting per test
npm run test:isolated

# Only structural tests
npm test -- tests/structural

# Only behavioural tests
npm test -- tests/behavioral

# A single test by name
npm test -- -g "toggle"

# View the HTML report after a run
npx playwright show-report
```

---

## Test output

| Artifact | Location |
|----------|----------|
| HTML report | `playwright-report/index.html` |
| Traces | Attached to every test in the HTML report |
| Screenshots | Captured for every test |
| Video | Every test locally; failure-only in CI |

---

## Test scenarios

### Structural (`tests/structural/test.spec.ts`)

Verify that the plugin registers its action-button dropdown item in the actions dropdown and that the
item is labelled "PiP Window". Clicking the toggle is covered by the single-user behavioural spec, not
here.

### Behavioural – single user (`tests/behavioral/single-user.spec.ts`)

Verify the toggle workflow and the localStorage persistence of the active state using only the
moderator/presenter, that the Document Picture-in-Picture window actually opens and renders the plugin
into it, and that a shared webcam stream is carried into that window and plays there.

The webcam test shares the synthetic camera supplied by Chromium's
`--use-fake-device-for-media-stream` (the same approach BBB core uses in
`bigbluebutton-tests/playwright/webcam`). It covers the one mechanic no component test can reach: the
plugin reads the `MediaStream` off a `<video>` in the **client** document (`pollForVideoSrc` +
`createVideoSelector`) and re-attaches it to a `<video>` it rendered in the **PiP** document. The test
asserts `srcObject` is attached and that `currentTime` advances, which only holds if frames are really
decoding on the other side of the document boundary.

### Behavioural – multi-user (`tests/behavioral/multi-user.spec.ts`)

Verify that the dropdown toggle is available independently for a moderator and an attendee in the same
meeting, and that a chat message sent by the attendee surfaces as a toast inside the moderator's PiP
window. The chat case needs two users because `ChatNotifier` deliberately skips the current user's own
messages (`msg.senderId !== currentUser.userId`).

> **Note on the PiP window contents.** The plugin renders its grid inside a `documentPictureInPicture`
> window, and that window *is* reachable — Chromium exposes it as an ordinary `about:blank` page on the
> same `BrowserContext`. This relies on **undocumented behaviour**: the spec requires transient
> activation for `requestWindow()`, but headless Chromium does not enforce it as written
> (`navigator.userActivation` reads `true` on a page never interacted with). `openPipWindow` clicks an
> inert overlay first so a real activation is live should that change, though it buys nothing measurable
> today. If these tests ever fail there it is not a plugin bug — see `tests/core/pipWindowHelper.ts`.
>
> The one thing headless Chromium will not do is background a tab, and the plugin only opens the window
> from a `visibilitychange` handler that checks `document.hidden`. `page.bringToFront()` on a second page
> does not flip `document.hidden`, and `Emulation.setPageVisibilityOverride` has been removed from the
> DevTools protocol. `tests/core/tabVisibilityDriver.ts` therefore overrides the `document.hidden` /
> `document.visibilityState` getters behind a flag and fires the event itself — see
> `installVisibilityOverride` / `openPipWindow`. It must be installed on the context **before** the first
> navigation.

---

## Meeting isolation

By default the structural and single-user suites share **one BBB meeting** across all their tests — it is
created once in `beforeAll`, and `afterAll` closes the browser context. This is fast, but tests within a
suite depend on the state each leaves behind.

Setting `TEST_MEETINGS=isolated` switches those two suites to **one meeting per test**, created in
`beforeEach` and released in `afterEach`. Tests become fully independent at the cost of more setups.

`TEST_MEETINGS` does **not** affect the multi-user suite: its `multiUserTest` fixture is per-test by
construction, so it always creates a fresh meeting and two browser contexts for every test.

| Mode | Meetings created | Tests run | When to use |
|------|-----------------|-----------|-------------|
| default (`npm test`) | one per suite (multi-user: one per test) | serially within each suite | Normal development |
| isolated (`npm run test:isolated`) | one per test | can run in parallel | Debugging flaky state, CI full isolation |

Note that neither mode ends the meeting on the BBB server — nothing calls `/api/end`, so meetings linger
until the server times them out.

---

## Interactive live meeting (`tests/interactive/live-meeting.spec.ts`)

Not a test — a session driver for manual/exploratory work on the plugin. It creates a meeting with the
plugin loaded, **prints a moderator join URL for you**, then joins bot attendees (6 by default, all with
different names) that share the synthetic Chromium webcam, and has one of them post a public chat message
every 30 s so PiP toasts and the stream grid have something to react to.

The bots that use audio join with userdata that pins the audio flow to one short path, so it does not
depend on how the target server is configured: `bbb_auto_join_audio=true`, `bbb_listen_only_mode=false`,
`bbb_force_listen_only=false` and `bbb_skip_check_audio=true`. There is deliberately no equivalent for
the webcam preview — BBB 3.x reads `skipVideoPreview` only from the server settings, with no userdata
override — so `shareWebcam` observes the client instead of predicting it.

> Every suite goes through `SessionPage.dismissOpenModals()` after the join for the same reason. What the
> client puts on screen by itself depends on the server (`autoJoin` opens the audio modal,
> `autoShareWebcam` queues the webcam preview behind it), and a modal left open swallows the first click
> of whatever runs next — which shows up as a bare "an overlay intercepts pointer events" timeout on a
> click that looks perfectly innocent.

The first three bots also **join audio unmuted and beep**, each on its own slot of a shared 10 s cycle
(`0 s / 4 s / 6 s`, at 660 / 880 / 1175 Hz), so the active-speaker machinery always has someone to switch
between and you can tell by ear who is talking. The beep is not the Chromium fake device — that one is a
continuous tone. `beepDriver.ts` installs an init script that replaces `getUserMedia` for *audio-only*
requests with a WebAudio graph it can drive, so silence is the default and each beep is a real, encoded
microphone signal. Video requests still fall through to the fake camera. After the bots are up, the
script waits for the talking indicator on a silent bot's client and logs whether the beeps actually made
it through the audio bridge.

```bash
npm run live-meeting
```

It runs under its own `playwright.live.config.ts` (no timeout, one worker, no video/trace/screenshot), and
the main config lists `tests/interactive/` in `testIgnore` so `npm test` never picks it up.

| Variable | Default | Description |
|----------|---------|-------------|
| `LIVE_ATTENDEES` | `6` | Number of bot attendees to join |
| `LIVE_MIC_USERS` | `3` | How many of them join audio unmuted and beep |
| `LIVE_BEEP_INTERVAL_SEC` | `10` | Length of the beep cycle — each mic bot beeps once per cycle |
| `LIVE_BEEP_OFFSETS` | `0,4,6` | Comma-separated slots (in seconds) inside the cycle, one per mic bot |
| `LIVE_BEEP_DURATION_MS` | `400` | Length of one beep |
| `LIVE_BEEP_VOLUME` | `0.6` | Beep gain, `0`–`1` |
| `LIVE_CHAT_INTERVAL_SEC` | `30` | Seconds between the automated chat messages |
| `LIVE_DURATION_MIN` | `60` | Session length in minutes; `0` runs until `Ctrl+C` |
| `LIVE_MODERATOR_NAME` | `Moderator` | Name embedded in the printed moderator join URL |
| `LIVE_WEBCAM` | `true` | Set to `"false"` to join the bots without sharing webcams |
| `LIVE_WITH_PLUGIN` | `true` | Set to `"false"` to run against the stock client |

Examples:

```bash
LIVE_ATTENDEES=3 npm run live-meeting            # fewer bots
LIVE_DURATION_MIN=0 npm run live-meeting         # until Ctrl+C
LIVE_CHAT_INTERVAL_SEC=10 npm run live-meeting   # chattier
LIVE_MIC_USERS=0 npm run live-meeting            # silent meeting
LIVE_BEEP_OFFSETS=0,2,4,6 LIVE_MIC_USERS=4 npm run live-meeting
npm run live-meeting -- --headed                 # watch the bots' browsers
```

`LIVE_MIC_USERS` without matching `LIVE_BEEP_OFFSETS` spreads the bots evenly across the cycle; the
uneven `0/4/6` default only applies to the default three.

Unlike the suites, an unreachable plugin manifest is only a **warning** here: the session still starts,
with the stock client. The meeting is never ended explicitly — once the bots are closed the server times
it out.
