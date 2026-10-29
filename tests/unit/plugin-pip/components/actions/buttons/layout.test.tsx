import * as React from 'react';
import {
  describe, expect, it, vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';

const layout = {
  toggleContentFocus: vi.fn(),
  canFocusContent: false,
  contentFocused: false,
};

vi.mock('../../../../../../src/plugin-pip/components/contexts/layout', () => ({
  useLayoutContext: () => layout,
}));

// eslint-disable-next-line import/first
import LayoutButtonComponent from '../../../../../../src/plugin-pip/components/actions/buttons/layout/component';

describe('LayoutButtonComponent', () => {
  it('stays visible and disabled when content cannot be focused', () => {
    const intl = {
      formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
    } as never;

    render(<LayoutButtonComponent intl={intl} />);

    expect(screen.getByRole('button', { name: 'Focus content' })).toBeDisabled();
  });
});
