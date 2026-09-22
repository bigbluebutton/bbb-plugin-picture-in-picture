import * as React from 'react';
import { defineMessages, IntlShape } from 'react-intl';
import Tooltip from '../../../ui/tooltip';
import { useLayoutContext } from '../../../contexts/layout';

export const intlMessages = defineMessages({
  focusContent: {
    id: 'plugin.layout.button.focusContent',
    defaultMessage: 'Focus content',
  },
  unfocusContent: {
    id: 'plugin.layout.button.unfocusContent',
    defaultMessage: 'Unfocus content',
  },
});

interface LayoutButtonComponentProps {
  intl: IntlShape;
}

function LayoutButtonComponent({ intl }: LayoutButtonComponentProps) {
  const { toggleContentFocus, canFocusContent, contentFocused } = useLayoutContext();

  const className = ['media-btn'];
  const label = intl.formatMessage(
    contentFocused ? intlMessages.unfocusContent : intlMessages.focusContent,
  );

  return (
    <Tooltip content={label}>
      {({ children, styles, ...props }) => (
        <button
          {...props}
          className={className.join(' ')}
          type="button"
          onClick={toggleContentFocus}
          disabled={!canFocusContent}
          style={styles}
        >
          <span className="sr-only">
            {label}
          </span>
          <i className="icon-bbb-refresh" />
          {children}
        </button>
      )}
    </Tooltip>
  );
}

export default LayoutButtonComponent;
