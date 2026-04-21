import * as React from 'react';
import { PluginApi } from 'bigbluebutton-html-plugin-sdk';
import { defineMessages, IntlShape } from 'react-intl';
import { useToast } from '../ui/toast';
import { CHAT_MESSAGE_STREAM, type ChatMessageStreamResponse, type Message } from './queries';

const intlMessages = defineMessages({
  unknownUser: {
    id: 'plugin.chat.unknownUser',
    defaultMessage: 'Unknown User',
  },
});

interface ChatNotifierProps {
  intl: IntlShape;
  pluginApi: PluginApi;
}

interface ChatMessageToastProps {
  intl: IntlShape;
  message: Message;
}

function ChatMessageToast({ intl, message }: ChatMessageToastProps): React.ReactElement {
  const getRoleColor = (role: string | null): string => {
    const roleColors: Record<string, string> = {
      MODERATOR: '#3b82f6',
      VIEWER: '#8b5cf6',
    };
    return role ? (roleColors[role] || '#6b7280') : '#6b7280';
  };

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '100%',
  };

  const headerStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  };

  const avatarStyles: React.CSSProperties = {
    width: '32px',
    height: '32px',
    borderRadius: message.senderRole === 'VIEWER' ? '50%' : '0.5rem',
    backgroundColor: getRoleColor(message.senderRole),
    textTransform: 'capitalize',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '600',
    flexShrink: 0,
  };

  const nameStyles: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const messageStyles: React.CSSProperties = {
    fontSize: '13px',
    lineHeight: '1.5',
    color: 'rgba(255, 255, 255, 0.95)',
    wordBreak: 'break-word',
    maxHeight: '60px',
    overflow: 'auto',
  };

  const footerStyles: React.CSSProperties = {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontStyle: 'italic',
  };

  const getInitials = (name: string | null): string => {
    if (!name) return '?';
    return name.substring(0, 2);
  };

  return (
    <div style={containerStyles}>
      <div style={headerStyles}>
        <div style={avatarStyles}>
          {getInitials(message.senderName)}
        </div>
        <div style={nameStyles}>
          {message.senderName || intl.formatMessage(intlMessages.unknownUser)}
        </div>
        {message.createdAt && (
          <div style={footerStyles}>
            {intl.formatTime(message.createdAt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h24' })}
          </div>
        )}
      </div>
      {/* eslint-disable-next-line react/no-danger */}
      <div className="pip-chat-message-content" style={messageStyles} dangerouslySetInnerHTML={{ __html: message.messageAsHtml }} />
    </div>
  );
}

function ChatNotifier({ intl, pluginApi }: ChatNotifierProps): React.ReactNode {
  const cursor = React.useRef(new Date());
  const { showToast } = useToast();
  const { data: currentUser } = pluginApi.useCurrentUser();
  const {
    data: chatMessageStream,
  } = pluginApi.useCustomSubscription<ChatMessageStreamResponse>(
    CHAT_MESSAGE_STREAM,
    {
      variables: {
        createdAt: cursor.current.toISOString(),
      },
    },
  );

  React.useEffect(() => {
    if (!chatMessageStream?.chat_message_stream) return;
    if (!currentUser) return;
    chatMessageStream.chat_message_stream.forEach((msg) => {
      if (msg.senderId !== currentUser.userId) {
        showToast(<ChatMessageToast intl={intl} message={msg} />, 'default', 10000);
      }
    });
  }, [chatMessageStream, showToast, currentUser, intl]);

  return null;
}

export default ChatNotifier;
