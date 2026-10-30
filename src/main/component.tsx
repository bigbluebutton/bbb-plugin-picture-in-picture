/* eslint-disable no-console */
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { BbbPluginSdk, FloatingWindow, OptionsDropdownOption } from 'bigbluebutton-html-plugin-sdk';
import { defineMessages } from 'react-intl';
import { useI18n } from '../common/hooks';
import Pip from '../plugin-pip/component';
import { useVideoStreams, useScreenshare } from '../plugin-pip/components/streams/hooks';
import FocusWarning from '../plugin-pip/components/warning/component';
import { useCurrentUserVoice } from '../plugin-pip/components/actions/hooks';
import type { PipControls } from '../plugin-pip/components/actions/buttons/deactivate/component';
import styles from './stylesheet';

const isPipSupported = 'documentPictureInPicture' in window;

const PIP_ACTIVE_KEY = 'pip-plugin-active';
const PIP_DISABLED_MEETING_KEY = 'pip-plugin-disabled-meeting';

// Outer size of the focus warning (max width/height plus padding), used to keep it on screen.
const FOCUS_WARNING_WIDTH = 378;
const FOCUS_WARNING_HEIGHT = 91;
const FOCUS_WARNING_MARGIN = 8;

const intlMessages = defineMessages({
  activate: {
    id: 'plugin.pip.activate',
    defaultMessage: 'Activate PiP Window',
  },
  deactivate: {
    id: 'plugin.pip.deactivate',
    defaultMessage: 'Deactivate PiP Window',
  },
});

interface MainComponentProps {
  pluginUuid: string;
  active: boolean;
}

function MainComponent({ pluginUuid, active }: MainComponentProps): React.ReactNode {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);
  const { intl } = useI18n(pluginApi);
  const pipActiveRef = React.useRef(active ?? true);
  const pipWindowRef = React.useRef<Window | null>(null);
  const hasMediaRef = React.useRef(false);
  const meetingIdRef = React.useRef<string | null>(null);
  const [pipEnabled, setPipEnabled] = React.useState<boolean>(active ?? true);
  const [disabledForMeeting, setDisabledForMeeting] = React.useState(false);
  const pipActive = pipEnabled && !disabledForMeeting;
  pipActiveRef.current = pipActive;
  const [showFocusWarning, setShowFocusWarning] = React.useState(false);
  const { data: webcams } = useVideoStreams(pluginApi);
  const { data: screenshare } = useScreenshare(pluginApi);
  const { data: presentation } = pluginApi.useCurrentPresentation() ?? {};
  const hasWebcams = Boolean(webcams?.user_camera?.length);
  const hasScreenshare = Boolean(screenshare?.screenshare?.length);
  const hasPresentation = Boolean(presentation);
  const hasMedia = hasScreenshare || hasWebcams || hasPresentation;
  hasMediaRef.current = hasMedia;
  const { data: currentUser } = pluginApi.useCurrentUser();
  const { joined: joinedVoice } = useCurrentUserVoice(pluginApi) || {};
  const amISharingWebcam = Boolean(currentUser?.cameras?.length);
  const amISharingMediaRef = React.useRef(joinedVoice || amISharingWebcam);
  amISharingMediaRef.current = joinedVoice || amISharingWebcam;

  const { data: meeting } = pluginApi.useMeetingData((m) => ({ meetingId: m.meetingId }));
  const meetingId = meeting?.meetingId;
  meetingIdRef.current = meetingId ?? null;

  React.useEffect(() => {
    if (!meetingId) return;
    setDisabledForMeeting(localStorage.getItem(PIP_DISABLED_MEETING_KEY) === meetingId);
  }, [meetingId]);

  const setPipEnabledState = React.useCallback((value: boolean) => {
    pipActiveRef.current = value;
    localStorage.setItem(PIP_ACTIVE_KEY, JSON.stringify(value));
    setPipEnabled(value);
    if (value) {
      localStorage.removeItem(PIP_DISABLED_MEETING_KEY);
      setDisabledForMeeting(false);
    }
  }, []);

  const pipControls = React.useMemo<PipControls>(() => ({
    close: () => {
      pipWindowRef.current?.close();
    },
    disableForMeeting: () => {
      pipActiveRef.current = false;
      if (meetingIdRef.current) {
        localStorage.setItem(PIP_DISABLED_MEETING_KEY, meetingIdRef.current);
      }
      setDisabledForMeeting(true);
      pipWindowRef.current?.close();
    },
    disableAlways: () => {
      setPipEnabledState(false);
      pipWindowRef.current?.close();
    },
  }), [setPipEnabledState]);

  if (isPipSupported) {
    const activateLabel = intl?.formatMessage(intlMessages.activate) || 'Activate PiP Window';
    const deactivateLabel = intl?.formatMessage(intlMessages.deactivate) || 'Deactivate PiP Window';
    pluginApi.setOptionsDropdownItems([
      new OptionsDropdownOption({
        icon: { iconName: pipActive ? 'desktop_off' : 'desktop' },
        label: pipActive ? deactivateLabel : activateLabel,
        onClick: () => setPipEnabledState(!pipActiveRef.current),
      }),
    ]);
  }

  React.useEffect(() => {
    const startPipWindow = async () => {
      if (isPipSupported && pipActiveRef.current && hasMediaRef.current) {
        // @ts-expect-error This web API may not be supported by all major browsers.
        if (documentPictureInPicture.window) return false;

        // @ts-expect-error This web API may not be supported by all major browsers.
        const pipWindow = await documentPictureInPicture.requestWindow({
          height: 270,
          width: 480,
          preferInitialWindowPlacement: true,
        });

        pipWindowRef.current = pipWindow;

        const pipDiv = pipWindow.document.createElement('div');
        pipDiv.setAttribute('id', 'pip-root');
        pipWindow.document.body.append(pipDiv);
        const pipRoot = ReactDOM.createRoot(pipWindow.document.getElementById('pip-root'));

        const handlePageHide = () => {
          pipWindowRef.current = null;
          pipRoot.unmount();
        };

        pipWindow.addEventListener('pagehide', handlePageHide);

        const style = document.createElement('style');
        style.textContent = styles.toString();
        pipWindow.document.head.appendChild(style);

        const normalize = document.createElement('link');
        normalize.rel = 'stylesheet';
        normalize.type = 'text/css';
        normalize.href = 'stylesheets/normalize.css';
        pipWindow.document.head.appendChild(normalize);

        const icons = document.createElement('link');
        icons.rel = 'stylesheet';
        icons.type = 'text/css';
        icons.href = 'stylesheets/bbb-icons.css';
        pipWindow.document.head.appendChild(icons);

        const fonts = document.createElement('link');
        fonts.rel = 'stylesheet';
        fonts.type = 'text/css';
        fonts.href = 'stylesheets/bbb-icons.css';
        pipWindow.document.head.appendChild(fonts);

        pipRoot.render(
          <Pip
            pluginApi={pluginApi}
            pipWindow={pipWindow}
            intl={intl}
            pipControls={pipControls}
          />,
        );

        return true;
      }

      return false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        startPipWindow().then((started) => {
          if (started) console.debug('PiP window started by visibility change');
        }).catch((e) => {
          // @ts-expect-error This web API may not be supported by all major browsers.
          // PiP may have been started by PiP action.
          setShowFocusWarning(!documentPictureInPicture.window);
          console.warn(e);
        });
      } else {
        pipWindowRef.current?.close();
      }
    };

    const handleEnterPip = () => {
      startPipWindow().then((started) => {
        if (started) {
          setShowFocusWarning(false);
          console.debug('PiP window started by PiP action');
        }
      }).catch((e) => {
        // @ts-expect-error This web API may not be supported by all major browsers.
        // PiP may have been started by visibility change.
        setShowFocusWarning(!documentPictureInPicture.window);
        console.warn(e);
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // @ts-expect-error This media action may not be supported by all major browsers.
    navigator.mediaSession.setActionHandler('enterpictureinpicture', handleEnterPip);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // @ts-expect-error This media action may not be supported by all major browsers.
      navigator.mediaSession.setActionHandler('enterpictureinpicture', null);
    };
  }, [intl, pluginApi, pipControls]);

  React.useEffect(() => {
    if (!isPipSupported || !pipActive) return undefined;

    function handleFocus() {
      setShowFocusWarning(false);
    }

    document.addEventListener('click', handleFocus, { capture: true });

    return () => {
      document.removeEventListener('click', handleFocus, { capture: true });
    };
  }, [pipActive]);

  React.useEffect(() => {
    if (!isPipSupported || !pipActive) return undefined;

    if (showFocusWarning) {
      // Show the warning right below the options dropdown button, where the PiP
      // toggle lives, and keep it inside the viewport.
      const optionsButton = document.querySelector('[data-test="optionsButton"]');
      const rect = optionsButton?.getBoundingClientRect();
      const maxLeft = window.innerWidth - FOCUS_WARNING_WIDTH - FOCUS_WARNING_MARGIN;
      const maxTop = window.innerHeight - FOCUS_WARNING_HEIGHT - FOCUS_WARNING_MARGIN;
      const top = rect ? rect.bottom + FOCUS_WARNING_MARGIN : FOCUS_WARNING_MARGIN;
      const left = rect ? rect.right - FOCUS_WARNING_WIDTH : maxLeft;
      pluginApi.setFloatingWindows([
        new FloatingWindow({
          id: 'plugin-pip-focus-warning',
          top: Math.max(FOCUS_WARNING_MARGIN, Math.min(top, maxTop)),
          left: Math.max(FOCUS_WARNING_MARGIN, Math.min(left, maxLeft)),
          movable: true,
          backgroundColor: 'transparent',
          boxShadow: 'none',
          contentFunction: (element: HTMLElement) => {
            const root = ReactDOM.createRoot(element);
            root.render(<FocusWarning intl={intl} />);
            return root;
          },
        }),
      ]);
    }

    return () => {
      pluginApi.setFloatingWindows([]);
    };
  }, [showFocusWarning, pluginApi, pipActive]);

  return null;
}

export default MainComponent;
