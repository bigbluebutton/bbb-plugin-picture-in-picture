export const coreElements = {
  audioModal: 'div[data-test="audioModal"]',
  closeModal: 'button[data-test="closeModal"]',
  // Any open modal. The client swaps between several during the join flow, and
  // whichever is up swallows clicks aimed at the page behind it.
  modalOverlay: '#modals-container .ReactModal__Overlay',
  errorMessageLabel: 'span[id="error-message"]',
  whiteboard: 'div[data-testid="canvas"]',
  actions: 'button[data-test="actionsButton"]',

  // Webcam sharing - mirrors bigbluebutton-tests/playwright/core/elements.ts
  joinVideo: 'button[data-test="joinVideo"]',
  leaveVideo: 'button[data-test="leaveVideo"]',
  startSharingWebcam: 'button[data-test="startSharingWebcam"]',
  webcamSettingsModal: 'div[data-test="webcamSettingsModal"]',
  webcamMirroredVideoPreview: 'video[data-test="mirroredVideoPreview"]',
  webcamMirroredVideoContainer: 'video[data-test="mirroredVideoContainer"]',
  webcamConnecting: 'div[data-test="webcamConnecting"]',
  webcamVideoItem: 'div[data-test="webcamVideoItem"]',

  // Public chat
  chatButton: 'button[data-test="chatButton"]',
  chatBox: 'textarea[id="message-input"]',
  sendButton: 'button[data-test="sendMessageButton"]',

  // Audio - mirrors bigbluebutton-tests/playwright/core/elements.ts
  joinAudio: 'button[data-test="joinAudio"]',
  microphoneButton: 'button[data-test="microphoneBtn"]',
  joinEchoTestButton: 'button[data-test="joinEchoTestButton"]',
  establishingAudioLabel: 'span[data-test="establishingAudioLabel"]',
  unmuteMicButton: 'button[data-test="unmuteMicButton"]',
  muteMicButton: 'button[data-test="muteMicButton"]',
  isTalking: 'button[data-test="isTalking"]',
};
