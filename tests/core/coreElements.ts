export const coreElements = {
  audioModal: 'div[data-test="audioModal"]',
  closeModal: 'button[data-test="closeModal"]',
  errorMessageLabel: 'span[id="error-message"]',
  whiteboard: 'div[data-testid="canvas"]',
  actions: 'button[data-test="actionsButton"]',

  // Webcam sharing - mirrors bigbluebutton-tests/playwright/core/elements.ts
  joinVideo: 'button[data-test="joinVideo"]',
  leaveVideo: 'button[data-test="leaveVideo"]',
  startSharingWebcam: 'button[data-test="startSharingWebcam"]',
  webcamMirroredVideoPreview: 'video[data-test="mirroredVideoPreview"]',
  webcamMirroredVideoContainer: 'video[data-test="mirroredVideoContainer"]',
  webcamConnecting: 'div[data-test="webcamConnecting"]',
  webcamVideoItem: 'div[data-test="webcamVideoItem"]',

  // Public chat
  chatButton: 'button[data-test="chatButton"]',
  chatBox: 'textarea[id="message-input"]',
  sendButton: 'button[data-test="sendMessageButton"]',

  // Audio - mirrors bigbluebutton-tests/playwright/core/elements.ts. Verified
  // against the BBB 3.0 client source (audio-modal/component.jsx,
  // audio-settings/component.jsx, nav-bar/.../talking-indicator/component.tsx).
  joinAudio: 'button[data-test="joinAudio"]',
  microphoneButton: 'button[data-test="microphoneBtn"]',
  stopHearingButton: 'button[data-test="stopHearingButton"]',
  joinEchoTestButton: 'button[data-test="joinEchoTestButton"]',
  establishingAudioLabel: 'span[data-test="establishingAudioLabel"]',
  unmuteMicButton: 'button[data-test="unmuteMicButton"]',
  // NOTE: `muteMicButton` is the readiness signal for "audio connected AND
  // unmuted". Do NOT use `leaveAudio` for that - it lives inside the audio
  // dropdown, which is collapsed, so it is never visible on its own.
  muteMicButton: 'button[data-test="muteMicButton"]',
  talkingIndicator: 'div[data-test="talkingIndicator"]',
  isTalking: 'button[data-test="isTalking"]',
};
