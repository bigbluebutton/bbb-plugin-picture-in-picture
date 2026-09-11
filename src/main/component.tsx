/* eslint-disable no-console */
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { ActionButtonDropdownOption, BbbPluginSdk, FloatingWindow } from 'bigbluebutton-html-plugin-sdk';
import { defineMessages } from 'react-intl';
import { useI18n } from '../common/hooks';
import Pip from '../plugin-pip/component';
import { useVideoStreams, useScreenshare } from '../plugin-pip/components/streams/hooks';
import FocusWarning from '../plugin-pip/components/warning/component';
import { useCurrentUserVoice } from '../plugin-pip/components/actions/hooks';
import { ACTIONS_BUTTON_SELECTOR, reportMissingSelector } from '../common/bbb-selectors';
import styles from './stylesheet';

const isPipSupported = 'documentPictureInPicture' in window;

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
  const openingPipRef = React.useRef(false);
  const hasMediaRef = React.useRef(false);
  const [pipActive, setPipActive] = React.useState<boolean>(active ?? true);
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

  if (isPipSupported) {
    const activateLabel = intl?.formatMessage(intlMessages.activate) || 'Activate PiP Window';
    const deactivateLabel = intl?.formatMessage(intlMessages.deactivate) || 'Deactivate PiP Window';
    pluginApi.setActionButtonDropdownItems([
      new ActionButtonDropdownOption({
        allowed: true,
        icon: pipActive ? 'desktop_off' : 'desktop',
        label: pipActive ? deactivateLabel : activateLabel,
        onClick: () => {
          pipActiveRef.current = !pipActiveRef.current;
          localStorage.setItem('pip-plugin-active', JSON.stringify(pipActiveRef.current));
          setPipActive(pipActiveRef.current);
        },
        tooltip: pipActive ? deactivateLabel : activateLabel,
      }),
    ]);
  }

  React.useEffect(() => {
    const startPipWindow = async () => {
      if (isPipSupported && pipActiveRef.current && hasMediaRef.current) {
        // @ts-expect-error This web API may not be supported by all major browsers.
        if (documentPictureInPicture.window) return false;
        // Both triggers - visibilitychange and the mediaSession action - can
        // reach the check above before either has finished awaiting
        // requestWindow, so the guard alone does not prevent a double open.
        if (openingPipRef.current) return false;
        openingPipRef.current = true;

        let pipWindow;
        try {
          // @ts-expect-error This web API may not be supported by all major browsers.
          pipWindow = await documentPictureInPicture.requestWindow({
            height: 270,
            width: 480,
            preferInitialWindowPlacement: true,
          });
        } finally {
          openingPipRef.current = false;
        }

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

        pipRoot.render(
          <Pip
            pluginApi={pluginApi}
            pipWindow={pipWindow}
            intl={intl}
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
  }, [intl, pluginApi]);

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
      // The anchor belongs to the BBB client, not to this plugin: if it is ever
      // renamed or simply not rendered, dereferencing it would throw out of the
      // effect. Skipping the warning is the harmless outcome.
      const actionsButton = document.querySelector(ACTIONS_BUTTON_SELECTOR);
      if (!actionsButton) {
        reportMissingSelector(ACTIONS_BUTTON_SELECTOR, 'anchor for the focus warning');
        return undefined;
      }
      const rect = actionsButton.getBoundingClientRect();
      pluginApi.setFloatingWindows([
        new FloatingWindow({
          id: 'plugin-pip-focus-warning',
          top: rect.top - 90,
          left: rect.left + (rect.width / 2) - 181,
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
