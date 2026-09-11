/* eslint-disable no-console */

/**
 * Selectors that reach into the BigBlueButton client's DOM.
 *
 * These are the plugin's most fragile coupling: they are internals of another
 * project, they carry no compatibility guarantee, and when one stops matching
 * the plugin fails by quietly rendering nothing. A silent failure here is
 * indistinguishable from "nobody is sharing a camera", which is exactly what
 * makes a report from production impossible to diagnose. So every lookup goes
 * through here, and a selector that stops resolving says so once.
 */

export const VIDEO_LIST_CLASSNAME = 'video-provider_list';

export const SCREENSHARE_VIDEO_SELECTOR = '#screenshareContainer video';

export const ACTIONS_BUTTON_SELECTOR = '[data-test="actionsButton"]';

export const createVideoSelector = (streamId: string) => `.${VIDEO_LIST_CLASSNAME} .videoContainer[data-stream="${streamId}"] video`;

/**
 * Warn once per selector. These run inside polling loops, so warning on every
 * miss would flood the console and bury the first, useful occurrence.
 */
const reported = new Set<string>();

export function reportMissingSelector(selector: string, context: string): void {
  if (reported.has(selector)) return;
  reported.add(selector);
  console.warn(
    `[pip-plugin] could not find "${selector}" in the BigBlueButton client (${context}). `
    + 'The plugin reads the client DOM to locate media, so either the client markup changed '
    + 'and the plugin needs updating, or the client is deliberately not rendering that media.',
  );
}

/**
 * Resolve the client's webcam list container. Deliberately silent: the element
 * legitimately does not exist while nobody is sharing a camera, so callers
 * report only when they know a camera is expected.
 */
export function getVideoListContainer(): Element | null {
  return document.getElementsByClassName(VIDEO_LIST_CLASSNAME)[0] ?? null;
}
