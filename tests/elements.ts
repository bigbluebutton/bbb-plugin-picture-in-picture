import { coreElements } from './core/coreElements';

export const elements = {
  ...coreElements,

  // Action-button dropdown toggle registered by the plugin. On this BBB line the
  // client renders the plugin's dropdown option as a plain <li> WITHOUT the
  // data-test="actionDropdownButtonPlugin" attribute used by newer lines, so the
  // item is matched by its label text instead. The label toggles between
  // "Activate PiP Window" and "Deactivate PiP Window".
  pipActionButton: 'li:has-text("PiP Window")',

  // Elements rendered INSIDE the documentPictureInPicture window (behavioral).
  // The window is only opened by the plugin on a visibilitychange /
  // enterpictureinpicture trigger while media is present - see
  // tests/core/pipWindowHelper.ts for how the tests drive that trigger and reach
  // into the window.
  pipRoot: '#pip-root',
  pipCameras: '.cameras',
  pipWebcams: '#plugin-pip-webcams',
  pipVideo: '#plugin-pip-webcams video',

  // Body of a chat-notification toast rendered inside the PiP window by
  // ChatNotifier. The toast itself is styled inline with no stable class, so
  // this is the only reliable hook.
  pipChatMessage: '.pip-chat-message-content',

  // ── Grid cells inside the PiP window ────────────────────────────────────
  // Direct children of the grid: every cell, whatever its kind (webcam, slide,
  // screenshare or avatar). Used to assert the MAX_TILES ceiling.
  pipTile: '#plugin-pip-webcams > *',
  // Shared wrapper class of every non-avatar cell; carries the #111 background.
  pipVideoContainer: '.pip-video-container',
  pipSlideItem: '.pip-slide-item',

  // Avatar tiles (src/plugin-pip/components/streams/avatar-item.tsx).
  pipAvatarItem: '.pip-avatar-item',
  // The initial-plus-colour fallback, rendered when the user has no avatar
  // image OR when loading that image failed (onError).
  pipAvatarCircle: '.pip-avatar-circle',
};
