import * as React from 'react';
import { PluginApi } from 'bigbluebutton-html-plugin-sdk';
import { IntlShape } from 'react-intl';
import AudioButtonComponent from './buttons/audio/component';
import WebcamButtonComponent from './buttons/webcam/component';
import UnreadChatButtonComponent from './buttons/unread-chat/component';
import RaisedHandsButtonComponent from './buttons/raised-hands/component';
import UsersBadgeComponent from './buttons/users/component';
import LayoutButtonComponent from './buttons/layout/component';
import DeactivateButtonComponent, { type PipControls } from './buttons/deactivate/component';
import { useLayoutContext } from '../contexts/layout';

interface ActionsComponentProps {
  intl: IntlShape;
  pluginApi: PluginApi;
  pipWindow: Window;
  pipControls: PipControls;
}

function ActionsComponent({
  intl, pluginApi, pipWindow, pipControls,
}: ActionsComponentProps): React.ReactNode {
  const { actions } = useLayoutContext();
  return (
    <div
      className="actions"
      style={{
        position: 'absolute',
        left: actions.x,
        top: actions.y,
        width: actions.width,
        height: actions.height,
      }}
    >
      <div className="controls">
        <AudioButtonComponent intl={intl} pluginApi={pluginApi} />
        <WebcamButtonComponent intl={intl} pluginApi={pluginApi} />
        <UnreadChatButtonComponent intl={intl} pluginApi={pluginApi} pipWindow={pipWindow} />
        <RaisedHandsButtonComponent intl={intl} pluginApi={pluginApi} />
        <LayoutButtonComponent intl={intl} />
        <div
          style={{
            width: '1px',
            height: '100%',
            background: 'rgba(255, 255, 255, 0.2)',
            margin: '0 4px',
            alignSelf: 'center',
            borderRadius: '6px',
          }}
        />
        <UsersBadgeComponent intl={intl} pluginApi={pluginApi} />
      </div>
      <DeactivateButtonComponent intl={intl} pipControls={pipControls} />
    </div>
  );
}

export default ActionsComponent;
