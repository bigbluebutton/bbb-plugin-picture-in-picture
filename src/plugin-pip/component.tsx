import * as React from 'react';
import { PluginApi } from 'bigbluebutton-html-plugin-sdk';
import { IntlShape } from 'react-intl';
import CamerasComponent from './components/cameras/component';
import ActionsComponent from './components/actions/component';
import ScreenshareComponent from './components/screenshare/component';
import SlideComponent from './components/slide/component';
import ChatNotifier from './components/chat/notifier';
import RaisedHandNotifier from './components/raised-hands/component';
import { ToastProvider } from './components/ui/toast';
import { useVideoStreams } from './components/cameras/hooks';
import { useScreenshare } from './components/screenshare/hooks';
import { PipWindowProvider } from './components/contexts/pip-window';
import { LayoutProvider } from './components/contexts/layout';

interface PluginPipProps {
  intl: IntlShape
  pluginApi: PluginApi;
  pipWindow: Window;
}

function PluginPip({ intl, pluginApi, pipWindow }: PluginPipProps): React.ReactNode {
  const { data: currentUser } = pluginApi.useCurrentUser();
  const { data: webcams } = useVideoStreams(pluginApi);
  const { data: screenshare } = useScreenshare(pluginApi);
  const { data: presentation } = pluginApi.useCurrentPresentation() ?? {};

  const presenter = currentUser?.presenter;
  const moderator = currentUser?.role && currentUser.role === 'MODERATOR';
  const hasWebcams = webcams?.user_camera && Boolean(webcams?.user_camera.length);
  const hasScreenshare = screenshare?.screenshare && Boolean(screenshare?.screenshare?.length);
  const hasPresentation = presentation && Boolean(presentation);

  const containerClassName = ['container'];

  if (hasWebcams) containerClassName.push('has-webcams');
  if (hasScreenshare) containerClassName.push('has-screenshare');

  return (
    <PipWindowProvider pipWindow={pipWindow}>
      <LayoutProvider
        hasCameras={hasWebcams}
        hasScreenshare={hasScreenshare}
        hasPresentation={hasPresentation}
        presenter={presenter}
        moderator={moderator}
      >
        <ToastProvider intl={intl}>
          <div className={containerClassName.join(' ')}>
            <div className="video">
              <ScreenshareComponent pluginApi={pluginApi} />
              <SlideComponent pluginApi={pluginApi} hasScreenshare={hasScreenshare} />
              <CamerasComponent pluginApi={pluginApi} />
            </div>
            <ActionsComponent pluginApi={pluginApi} pipWindow={pipWindow} intl={intl} />
          </div>
          <ChatNotifier intl={intl} pluginApi={pluginApi} />
          {presenter && <RaisedHandNotifier intl={intl} pluginApi={pluginApi} />}
          <div id="modals-root" style={{ zIndex: 9999 }} />
        </ToastProvider>
      </LayoutProvider>
    </PipWindowProvider>
  );
}

export default PluginPip;
