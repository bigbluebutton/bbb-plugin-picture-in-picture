import { css } from 'styled-components';

const cssRules = css`
  * {
    box-sizing: border-box;
    min-width: 0;
  }

  *::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  *::-webkit-scrollbar-button {
    width: 0;
    height: 0;
  }
  *::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,.25);
    border: none;
    border-radius: 50px;
  }
  *::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,.5); }
  *::-webkit-scrollbar-thumb:active { background: rgba(0,0,0,.25); }
  *::-webkit-scrollbar-track {
    background: rgba(0,0,0,.25);
    border: none;
    border-radius: 50px;
  }
  *::-webkit-scrollbar-track:hover { background: rgba(0,0,0,.25); }
  *::-webkit-scrollbar-track:active { background: rgba(0,0,0,.25); }
  *::-webkit-scrollbar-corner { background: 0 0; }
  
  #videoWrapper {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
  }

  video {
    border-radius: 8px;
    border: 2px solid transparent;
  }

  video.talking {
    border-color: #3b82f6;
  }

  html {
    height: 100%;
    overflow: hidden;
  }

  body {
    font-family: 'Source Sans Pro', Arial, sans-serif;
    font-size: 1rem;
    background-color: #202020;
    height: 100%;
  }

  #pip-root {
    height: 100%;
  }

  .container {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .actions {
    padding: 0.5rem;
    width: 100%;
    display: flex;
    align-items: flex-end;

    .controls {
      background-color: #303030;
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      border-radius: 0.75rem;
      flex-grow: 1;
      padding: 0.25rem;
      height: 100%;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    border: 0;
  }

  @font-face {
    font-family: 'bbb-icons';
    src: url('fonts/BbbIcons/bbb-icons.woff2?v=VERSION') format('woff2'),
    url('fonts/BbbIcons/bbb-icons.woff?v=VERSION') format('woff');
    font-weight: normal;
    font-style: normal;
  }

  *:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .media-btn {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    line-height: normal;
    position: relative;
  }

  button:disabled {
    cursor: not-allowed;
  }

  .media-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  button:focus {
    outline: none;
    box-shadow: 0 0 0 2px #ffffff !important;
  }

  .badge {
    position: absolute;
    right: -10%;
    top: -10%;
    border-radius: 50%;
    line-height: 1;
    padding: 2px;
    height: 1rem;
    width: 1rem;
    font-size: 0.65rem;
    display: grid;
    place-items: center;
    background-color: #DF2721;
  }

  .video {
    flex-grow: 1;
    flex-shrink: 1;
    overflow: hidden;
    position: relative;
  }

  .webcams {
    display: grid;
    gap: 6px;
  }

  .webcams video {
    width: 100%;
    height: 100%;
  }

  .pip-video-container {
    position: relative;
    display: flex;
    background-color: #111;
    border-radius: 8px;
    overflow: hidden;
  }

  .cameras {
    padding: 0.5rem;
  }

  .pip-content-focused {
    grid-column: span 2;
    grid-row: span 2;
  }

  .pip-screenshare-item video {
    object-fit: contain;
  }

  .pip-video-container.pip-screenshare-item,
  .pip-video-container.pip-slide-item {
    background-color: #111;
  }

  .pip-slide-item img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .pip-video-container.pip-avatar-item {
    background-color: #303030;
    align-items: center;
    justify-content: center;
    border: 2px solid #111;
  }

  .pip-avatar-item.talking {
    border-color: #3b82f6;
  }

  .pip-avatar-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pip-avatar-circle {
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    aspect-ratio: 1;
    width: 40%;
    max-width: 4rem;
    min-width: 1.5rem;
    font-size: 1rem;
    text-transform: uppercase;
    user-select: none;
  }

  @keyframes avatar-pulse {
    0% {
      box-shadow: 0 0 0 0 var(--avatar-color);
    }
    70% {
      box-shadow: 0 0 0 0.5625rem transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  /*
    The avatar image fills the whole tile, and the tile clips its overflow, so an
    outward box-shadow would be invisible there — it pulses inwards instead.
  */
  @keyframes avatar-pulse-inset {
    0% {
      box-shadow: inset 0 0 0 0 var(--avatar-color);
    }
    70% {
      box-shadow: inset 0 0 0 0.5625rem transparent;
    }
    100% {
      box-shadow: inset 0 0 0 0 transparent;
    }
  }

  .pip-avatar-item.talking .pip-avatar-circle {
    animation: avatar-pulse 1s ease-in infinite;
  }

  .pip-avatar-item.talking img {
    animation: avatar-pulse-inset 1s ease-in infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 white;
    }
    70% {
      box-shadow: 0 0 0 0.5625rem transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    } 
  }

  .pulse {
    animation: pulse 1s ease-in infinite;
  }

  .pip-video-container .username {
    position: absolute;
    color: white;
    left: 0.25rem;
    bottom: 0.25rem;
    font-size: 65%;
    background-color: #111111CC;
    padding: 0.2rem;
    border-radius: 0.75rem;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 80%;
  }

  @keyframes skeleton-slide {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .shimmer {
    animation: skeleton-slide 1.5s ease-in-out infinite;
  }

  .pip-chat-message-content {
    a:link {
      color: #ffffff;
    }

    a:visited {
      color: #eaeaea;
    }

    a:active {
      color: #bababa;
    }

    a:hover {
      color: #9a9a9a;
    }
  }
`;

export default cssRules;
