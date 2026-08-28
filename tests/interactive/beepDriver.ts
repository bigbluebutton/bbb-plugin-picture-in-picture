/* eslint-disable import/no-extraneous-dependencies */
/**
 * Synthetic microphone for the live-meeting bots.
 *
 * Chromium's `--use-fake-device-for-media-stream` gives every bot the same
 * continuous tone, which is useless here: we need each bot to be *silent* most
 * of the time and beep on its own slot of a shared cycle. So an init script
 * replaces `getUserMedia` for audio-only requests with a WebAudio graph whose
 * `MediaStreamDestination` this file drives — the beep is generated inside the
 * page, is encoded and sent by the client like any other microphone input, and
 * is therefore actually audible to everyone in the conference.
 *
 * Video requests fall through to the real (fake-device) implementation, so the
 * same bot can still share the synthetic webcam.
 *
 * The schedule is anchored to an absolute epoch shared by every bot rather than
 * to "now", so the offsets stay in phase no matter how long each bot took to
 * join.
 */
import { BrowserContext, Page } from '@playwright/test';

export interface BeepSchedule {
  /** Wall-clock ms that offset 0 of the cycle is measured from, shared by all bots. */
  anchorEpochMs: number;
  /** Length of one full cycle. */
  intervalMs: number;
  /** This bot's slot inside the cycle. */
  offsetMs: number;
  frequencyHz: number;
  durationMs: number;
  /** Peak gain, 0..1. */
  volume: number;
}

declare global {
  interface Window {
    __beepBot?: {
      count: number;
      beep(frequencyHz: number, durationMs: number, volume: number): void;
      start(schedule: BeepSchedule): void;
    };
  }
}

/**
 * Must be called on the context *before* its first navigation, like any other
 * init script: the client grabs `navigator.mediaDevices` early.
 */
export async function installSyntheticMicrophone(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const { mediaDevices } = navigator;
    if (!mediaDevices?.getUserMedia) return;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

    let audioContext: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const ensureContext = (): AudioContext => {
      if (!audioContext) {
        audioContext = new AudioContext();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 1;
      }
      // Chromium can hand back a suspended context; a suspended graph renders
      // silence, which would look exactly like a broken beep.
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return audioContext;
    };

    window.__beepBot = {
      count: 0,

      beep(frequencyHz: number, durationMs: number, volume: number) {
        const audio = ensureContext();
        const startAt = audio.currentTime;
        const seconds = durationMs / 1000;
        const ramp = Math.min(0.02, seconds / 4);

        const oscillator = audio.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequencyHz;

        // Ramped envelope rather than a hard start/stop: an abrupt sine edge is
        // a click, and clicks are the first thing noise suppression discards.
        const envelope = audio.createGain();
        envelope.gain.setValueAtTime(0, startAt);
        envelope.gain.linearRampToValueAtTime(volume, startAt + ramp);
        envelope.gain.setValueAtTime(volume, startAt + seconds - ramp);
        envelope.gain.linearRampToValueAtTime(0, startAt + seconds);

        oscillator.connect(envelope);
        envelope.connect(masterGain as GainNode);
        oscillator.start(startAt);
        oscillator.stop(startAt + seconds + ramp);
        oscillator.onended = () => {
          oscillator.disconnect();
          envelope.disconnect();
        };

        if (window.__beepBot) window.__beepBot.count += 1;
      },

      start(schedule) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        ensureContext();
        const fire = () => window.__beepBot?.beep(
          schedule.frequencyHz,
          schedule.durationMs,
          schedule.volume,
        );
        let delay = (schedule.anchorEpochMs + schedule.offsetMs) - Date.now();
        while (delay < 0) delay += schedule.intervalMs;
        setTimeout(() => {
          fire();
          timer = setInterval(fire, schedule.intervalMs);
        }, delay);
      },
    };

    mediaDevices.getUserMedia = (constraints?: MediaStreamConstraints) => {
      const wantsAudio = Boolean(constraints?.audio);
      const wantsVideo = Boolean(constraints?.video);
      if (!wantsAudio || wantsVideo) return originalGetUserMedia(constraints);

      const audio = ensureContext();
      // A fresh destination per call: the client stops the track it got when it
      // moves from the echo test to the live connection, and a stopped track
      // never resumes.
      const destination = audio.createMediaStreamDestination();
      (masterGain as GainNode).connect(destination);

      const audioConstraints = constraints?.audio;
      const requested = typeof audioConstraints === 'object' ? audioConstraints.deviceId : undefined;
      const deviceId = typeof requested === 'object' && requested !== null
        ? (requested as ConstrainDOMStringParameters).exact
        : requested;
      if (typeof deviceId === 'string') {
        // The client matches the track back to the device it asked for; a
        // WebAudio track reports no deviceId of its own.
        const [track] = destination.stream.getAudioTracks();
        const originalGetSettings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...originalGetSettings(), deviceId });
      }

      return Promise.resolve(destination.stream);
    };
  });
}

/** Start this page's beep cycle. The page must have joined audio unmuted first. */
export async function startBeeping(page: Page, schedule: BeepSchedule): Promise<void> {
  await page.evaluate((value) => {
    if (!window.__beepBot) throw new Error('The synthetic microphone was not installed on this page.');
    window.__beepBot.start(value);
  }, schedule);
}

/** How many beeps this page has emitted so far, or null when the driver is gone. */
export async function readBeepCount(page: Page): Promise<number | null> {
  if (page.isClosed()) return null;
  return page.evaluate(() => window.__beepBot?.count ?? null).catch(() => null);
}
