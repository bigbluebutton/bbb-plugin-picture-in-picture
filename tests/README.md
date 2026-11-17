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

Verify that the plugin registers its options dropdown item in the options dropdown and that the
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
