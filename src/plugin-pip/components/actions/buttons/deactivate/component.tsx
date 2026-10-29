import * as React from 'react';
import { defineMessages, IntlShape } from 'react-intl';
import Tooltip from '../../../ui/tooltip';
import Popover from '../../../ui/popover';

export const intlMessages = defineMessages({
  deactivate: {
    id: 'plugin.pip.deactivate',
    defaultMessage: 'Deactivate PiP Window',
  },
  close: {
    id: 'plugin.pip.menu.close',
    defaultMessage: 'Close',
  },
  disableForMeeting: {
    id: 'plugin.pip.menu.disableForMeeting',
    defaultMessage: 'Deactivate for this meeting',
  },
  disableAlways: {
    id: 'plugin.pip.menu.disableAlways',
    defaultMessage: 'Deactivate always',
  },
});

export interface PipControls {
  close: () => void;
  disableForMeeting: () => void;
  disableAlways: () => void;
}

interface DeactivateButtonComponentProps {
  intl: IntlShape;
  pipControls: PipControls;
}

interface MenuItem {
  key: string;
  label: string;
  icon: string;
  onClick: () => void;
}

const menuStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '0.25rem 0',
  color: '#fff',
};

const menuItemStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  background: 'none',
  border: 'none',
  color: 'inherit',
  fontSize: '14px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

function DeactivateButtonComponent({ intl, pipControls }: DeactivateButtonComponentProps) {
  const [open, setOpen] = React.useState(false);
  const label = intl.formatMessage(intlMessages.deactivate);

  const items: MenuItem[] = [
    {
      key: 'close',
      label: intl.formatMessage(intlMessages.close),
      icon: 'close',
      onClick: pipControls.close,
    },
    {
      key: 'disableForMeeting',
      label: intl.formatMessage(intlMessages.disableForMeeting),
      icon: 'desktop_off',
      onClick: pipControls.disableForMeeting,
    },
    {
      key: 'disableAlways',
      label: intl.formatMessage(intlMessages.disableAlways),
      icon: 'desktop_off',
      onClick: pipControls.disableAlways,
    },
  ];

  const popoverContent = (
    <div style={menuStyles} role="menu">
      {items.map((item) => (
        <button
          key={item.key}
          className="pip-menu-item"
          type="button"
          role="menuitem"
          style={menuItemStyles}
          onClick={() => {
            setOpen(false);
            item.onClick();
          }}
        >
          <i className={`icon-bbb-${item.icon}`} />
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      position="top"
      align="end"
      open={open}
      onOpenChange={setOpen}
    >
      {({ disabled, onClick, ref }) => (
        <Tooltip content={label} position="left">
          {({
            children, styles, onBlur, onFocus, onMouseEnter, onMouseLeave,
          }) => (
            <button
              className="media-btn deactivate-btn"
              type="button"
              ref={ref}
              style={styles}
              aria-haspopup="menu"
              aria-expanded={open}
              {...{
                disabled,
                onClick,
                onMouseEnter,
                onMouseLeave,
                onBlur,
                onFocus,
              }}
            >
              <span className="sr-only">
                {label}
              </span>
              <i className="icon-bbb-desktop_off" />
              {children}
            </button>
          )}
        </Tooltip>
      )}
    </Popover>
  );
}

export default DeactivateButtonComponent;
