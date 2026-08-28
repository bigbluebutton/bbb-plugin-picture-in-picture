import {
  expect, Page, Browser, Locator,
} from '@playwright/test';
import {
  ELEMENT_WAIT_EXTRA_LONG_TIME, ELEMENT_WAIT_LONGER_TIME, ELEMENT_WAIT_TIME, LOOP_INTERVAL,
} from './constants';
import * as parameters from './parameters';
import {
  createMeeting, generateSettingsData, getJoinURL, SessionSettings,
} from './helpers';
import { coreElements as e } from './coreElements';

interface PageProps {
  browser: Browser;
  page: Page;
}

export interface InitOptions {
  fullName?: string;
  createParameter?: string;
  joinParameter?: string;
  shouldCloseAudioModal?: boolean;
  skipSessionDetailsModal?: boolean;
  shouldCheckAllInitialSteps?: boolean;
}

interface InitFunctionParameters {
  isModerator: boolean;
  shouldCloseAudioModal: boolean;
  initOptions: InitOptions;
}

export interface InitParameters {
  server: string | undefined;
  secret: string | undefined;
  welcome: string;
  fullName: string;
  moderatorPW: string;
  attendeePW: string;
}

export class SessionPage {
  readonly page: Page;

  readonly browser: Browser;

  settings: SessionSettings | undefined;

  initParameters: InitParameters;

  username: string;

  meetingId: string;

  constructor({ browser, page }: PageProps) {
    this.browser = browser;
    this.page = page;
    this.username = '';
    this.meetingId = '';
    this.initParameters = { ...parameters };
  }

  async init({ isModerator, shouldCloseAudioModal, initOptions = {} }: InitFunctionParameters) {
    const {
      fullName,
      createParameter,
      joinParameter,
      skipSessionDetailsModal = true,
      shouldCheckAllInitialSteps = true,
    } = initOptions;

    if (!isModerator) this.initParameters.moderatorPW = '';
    this.username = fullName || this.initParameters.fullName;

    this.meetingId = await createMeeting(this.initParameters, createParameter);
    const joinUrl = getJoinURL({
      meetingID: this.meetingId,
      isModerator,
      joinParameter,
      skipSessionDetailsModal,
      fullName: this.username,
    });
    const response = await this.page.goto(joinUrl);
    await expect(response?.ok()).toBeTruthy();
    const hasErrorLabel = await this.checkElement(e.errorMessageLabel);
    await expect(hasErrorLabel, 'should pass the authentication and the layout element should be displayed').toBeFalsy();
    if (shouldCheckAllInitialSteps) {
      await this.page.waitForSelector('div#layout', { timeout: ELEMENT_WAIT_EXTRA_LONG_TIME });
      this.settings = await generateSettingsData(this.page);
      if (shouldCloseAudioModal) await this.dismissOpenModals();
    }
    // overwrite for font used in CI
    await this.page.addStyleTag({
      content: `
        body {
          font-family: 'Liberation Sans', Arial, sans-serif;
        }`,
    });
  }

  async hasElement(selector: string, description: string, timeout = ELEMENT_WAIT_TIME) {
    const locator = this.getLocator(selector);
    await expect(locator, description).toBeVisible({ timeout });
  }

  async wasRemoved(selector: string, description: string, timeout = ELEMENT_WAIT_TIME) {
    const locator = this.getLocator(selector);
    await expect(locator, description).toBeHidden({ timeout });
  }

  async checkElement(selector: string, index = 0): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    return this.page.evaluate(([selector, index]) => {
      if (typeof selector !== 'string') throw new Error('Selector must be a string');
      const element = document.querySelectorAll(selector);
      if (element.length > 0) {
        return element[index as number] !== undefined;
      }
      return false;
    }, [selector, index]);
  }

  getLocator(selector: string): Locator {
    return this.page.locator(selector);
  }

  async hasText(selector: string, text: string, description: string, timeout = ELEMENT_WAIT_TIME) {
    const locator = this.getLocator(selector).first();
    await expect(locator, description).toContainText(text, { timeout });
  }

  async closeAudioModal() {
    await this.hasElement(e.audioModal, 'should display the audio modal', ELEMENT_WAIT_EXTRA_LONG_TIME);
    await this.page.click(e.closeModal);
  }

  /**
   * Close whatever the client opened on its own during the join, and wait until
   * the screen stays clear. Which modals appear depends on the server:
   * `autoJoin` brings up the audio modal, `autoShareWebcam` queues the webcam
   * preview behind it, and any of them left open swallows the first click of
   * whatever runs next - including clicks aimed at the plugin.
   */
  async dismissOpenModals(timeout = ELEMENT_WAIT_LONGER_TIME) {
    const modalOverlay = this.getLocator(e.modalOverlay).first();
    const deadline = Date.now() + timeout;
    let clearSince = 0;

    /* eslint-disable no-await-in-loop */
    // Two consecutive clear checks, because the modals are queued: closing one
    // can let the next one in a beat later.
    while (clearSince < 2) {
      if (Date.now() > deadline) return;
      if (await modalOverlay.isVisible()) {
        clearSince = 0;
        await this.clickIfVisible(e.closeModal);
      } else {
        clearSince += 1;
      }
      await this.page.waitForTimeout(LOOP_INTERVAL);
    }
    /* eslint-enable no-await-in-loop */
  }

  async waitAndClick(selector: string, timeout = ELEMENT_WAIT_TIME) {
    await this.page.waitForSelector(selector, { timeout });
    await this.page.click(selector, { timeout });
  }

  /**
   * Share the current user's webcam. Like `Page.shareWebcam` from
   * bigbluebutton-tests/playwright/core/page.ts, except that it reads the
   * client's state instead of predicting it from the server settings: the
   * preview modal may be skipped (`skipVideoPreview`), and the client also
   * opens one on its own in some join flows - a beat after the audio modal
   * closes, which is exactly late enough to swallow the toolbar click.
   *
   * Chromium is launched with --use-fake-device-for-media-stream, so the
   * "camera" is the synthetic rolling-pattern stream.
   */
  async shareWebcam(timeout = ELEMENT_WAIT_EXTRA_LONG_TIME) {
    const { webcamSharingEnabled } = this.settings || {};

    if (webcamSharingEnabled === false) {
      throw new Error('Webcam sharing is disabled on this server; cannot share a webcam.');
    }

    const previewModal = this.getLocator(e.webcamSettingsModal).first();
    const modalOverlay = this.getLocator(e.modalOverlay).first();
    const alreadySharing = this.getLocator(e.leaveVideo).first();
    const deadline = Date.now() + timeout;

    // Reach either "the preview is up" or "the camera is already going", from
    // wherever the client happens to be. The toolbar button is only pressed
    // while nothing covers the page, and a click that loses that race is just
    // retried on the next pass.
    /* eslint-disable no-await-in-loop */
    while (!(await previewModal.isVisible()) && !(await alreadySharing.isVisible())) {
      if (Date.now() > deadline) {
        throw new Error(`Could not start the webcam flow for "${this.username}" within ${timeout}ms.`);
      }
      if (!(await modalOverlay.isVisible())) {
        try {
          await this.clickIfVisible(e.joinVideo);
        } catch {
          // A modal opened between the check and the click; try again.
        }
      }
      await this.page.waitForTimeout(LOOP_INTERVAL);
    }
    /* eslint-enable no-await-in-loop */

    if (await previewModal.isVisible()) {
      await this.hasElement(e.webcamMirroredVideoPreview, 'should display the webcam video preview', timeout);
      await this.waitAndClick(e.startSharingWebcam);
    }

    await this.page.waitForSelector(e.webcamMirroredVideoContainer, { timeout });
    await this.page.waitForSelector(e.leaveVideo, { timeout });
    await this.wasRemoved(
      e.webcamConnecting,
      'should stop showing the webcam connecting element once connected',
      timeout,
    );
  }

  /** Click `selector` if it is on screen right now. Says whether it clicked. */
  async clickIfVisible(selector: string): Promise<boolean> {
    const locator = this.getLocator(selector).first();
    if (!(await locator.isVisible())) return false;
    await locator.click();
    return true;
  }

  /**
   * Join the audio conference with the microphone, unmuted.
   *
   * Unlike `Page.joinMicrophone` in bigbluebutton-tests/playwright/core/page.ts,
   * this does not assume a fixed sequence of screens, because there isn't one.
   * The device-choice screen (`microphoneBtn`) only exists when listen-only mode
   * is available, and `audio-modal/container.jsx` turns listen-only off for any
   * meeting whose audio bridge is LiveKit - there the modal joins the microphone
   * by itself. `bbb_auto_join_audio` takes the toolbar button out of the flow,
   * and `bbb_skip_check_audio` takes out the echo test.
   *
   * So this drives whichever screen it finds and stops at the audio controls,
   * the one state every path ends in.
   */
  async joinMicrophone(timeout = ELEMENT_WAIT_EXTRA_LONG_TIME * 2) {
    const connected = this.getLocator(`${e.muteMicButton}, ${e.unmuteMicButton}`).first();
    const modalOverlay = this.getLocator(e.modalOverlay).first();
    const clicked = new Set<string>();
    const deadline = Date.now() + timeout;

    /* eslint-disable no-await-in-loop */
    while (!(await connected.isVisible())) {
      if (Date.now() > deadline) {
        throw new Error(`Audio did not connect for "${this.username}" within ${timeout}ms.`);
      }
      // A modal on screen means the client is already inside the audio flow, so
      // advance whichever screen it is showing. Clicking the toolbar button then
      // would only hit the overlay - and with autoJoin the modal opens on its
      // own, so this is a real race, not a hypothetical one.
      const steps = (await modalOverlay.isVisible())
        ? [e.microphoneButton, e.joinEchoTestButton]
        : [e.joinAudio];
      for (let index = 0; index < steps.length; index += 1) {
        // Each screen is clicked at most once: a click that does not advance
        // the flow means something else is wrong, and retrying it forever would
        // hide that until the deadline.
        if (!clicked.has(steps[index]) && await this.clickIfVisible(steps[index])) {
          clicked.add(steps[index]);
          break;
        }
      }
      await this.page.waitForTimeout(LOOP_INTERVAL);
    }
    /* eslint-enable no-await-in-loop */

    // Some paths leave a modal sitting on top of the audio controls once the
    // connection is up - the audio modal itself when it had no options to show,
    // or the webcam preview the client opens next - and the unmute button
    // underneath it is unclickable. Sharing a webcam afterwards reopens the
    // preview anyway.
    await this.clickIfVisible(e.closeModal);
    // Whether the client lands muted depends on the meeting and on what this
    // browser did last, so unmute only when there is something to unmute.
    await this.clickIfVisible(e.unmuteMicButton);
    await this.hasElement(e.muteMicButton, 'should display the mute mic button once unmuted', timeout);
  }

  /** Send a message to the public chat, opening the chat panel if needed. */
  async sendPublicChatMessage(message: string, timeout = ELEMENT_WAIT_TIME) {
    const chatBox = this.getLocator(e.chatBox).first();
    if (!(await chatBox.isVisible())) {
      await this.waitAndClick(e.chatButton, timeout);
    }
    await chatBox.waitFor({ state: 'visible', timeout });
    await chatBox.fill(message);
    await this.waitAndClick(e.sendButton, timeout);
  }
}
