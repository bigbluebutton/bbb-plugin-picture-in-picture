import * as React from 'react';
import { PluginApi } from 'bigbluebutton-html-plugin-sdk';
import { IntlShape } from 'react-intl';
import StreamsComponent from './components/streams/component';
import ActionsComponent from './components/actions/component';
import type { PipControls } from './components/actions/buttons/deactivate/component';
import ChatNotifier from './components/chat/notifier';
import RaisedHandNotifier from './components/raised-hands/component';
import { ToastProvider } from './components/ui/toast';
import {
  usePresentationAreaOpen,
  useScreenshare,
  useUsers,
  useVideoStreams,
} from './components/streams/hooks';
import { PipWindowProvider } from './components/contexts/pip-window';
import { LayoutProvider } from './components/contexts/layout';

interface PluginPipProps {
  intl: IntlShape
  pluginApi: PluginApi;
  pipWindow: Window;
  pipControls: PipControls;
}

function PluginPip({
  intl, pluginApi, pipWindow, pipControls,
}: PluginPipProps): React.ReactNode {
  const { data: currentUser } = pluginApi.useCurrentUser();
  const { data: webcams } = useVideoStreams(pluginApi);
  const { data: screenshare } = useScreenshare(pluginApi);
  const { data: presentation } = pluginApi.useCurrentPresentation() ?? {};
  const isPresentationAreaOpen = usePresentationAreaOpen(pluginApi);

  const presenter = currentUser?.presenter;
  const moderator = currentUser?.role && currentUser.role === 'MODERATOR';
  // Participants without a camera are shown as avatar tiles, so they count as
  // tiles the content can be focused against, just like webcams. The avatar
  // count is only trusted once its subscription has settled; until then the
  // tiles are reported as unknown so the initial focus is not decided early.
  const { data: users, loading: usersLoading } = useUsers(pluginApi);
  const cameraCount = webcams?.user_camera?.length;
  const avatarCount = usersLoading ? undefined : (users?.user?.length ?? 0);
  const tileCount = cameraCount === undefined || avatarCount === undefined
    ? undefined
    : cameraCount + avatarCount;
  const hasTiles = tileCount === undefined ? undefined : tileCount > 0;
  const hasScreenshare = screenshare?.screenshare && Boolean(screenshare?.screenshare?.length);
  const hasPresentation = presentation === undefined
    ? undefined
    : Boolean(presentation) && isPresentationAreaOpen;

  return (
    <PipWindowProvider pipWindow={pipWindow}>
      <LayoutProvider
        hasTiles={hasTiles}
        tileCount={tileCount}
        hasScreenshare={hasScreenshare}
        hasPresentation={hasPresentation}
        presenter={presenter}
        moderator={moderator}
      >
        <ToastProvider intl={intl}>
          <div className="container">
            <div className="video">
              <StreamsComponent pluginApi={pluginApi} hasPresentation={hasPresentation} />
            </div>
            <ActionsComponent
              pluginApi={pluginApi}
              pipWindow={pipWindow}
              intl={intl}
              pipControls={pipControls}
            />
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
