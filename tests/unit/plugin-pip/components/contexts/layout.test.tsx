import * as React from 'react';
import { describe, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  LayoutProvider,
  useLayoutContext,
} from '../../../../../src/plugin-pip/components/contexts/layout';
import { PipWindowProvider } from '../../../../../src/plugin-pip/components/contexts/pip-window';

function FocusState() {
  const { contentFocused, toggleContentFocus } = useLayoutContext();
  return (
    <button type="button" onClick={toggleContentFocus}>
      {contentFocused ? 'focused' : 'unfocused'}
    </button>
  );
}

interface LayoutHarnessProps {
  hasPresentation?: boolean;
  hasCameras?: boolean;
}

function LayoutHarness({ hasPresentation, hasCameras = true }: LayoutHarnessProps) {
  return (
    <PipWindowProvider pipWindow={window}>
      <LayoutProvider
        hasCameras={hasCameras}
        cameraCount={hasCameras ? 1 : 0}
        hasScreenshare={false}
        hasPresentation={hasPresentation}
        presenter
        moderator
      >
        <FocusState />
      </LayoutProvider>
    </PipWindowProvider>
  );
}

describe('LayoutProvider', () => {
  it('unfocuses the content while the presentation is minimised', async () => {
    const { rerender } = render(<LayoutHarness hasPresentation />);

    await screen.findByText('focused');

    rerender(<LayoutHarness hasPresentation={false} />);
    await screen.findByText('unfocused');
  });

  it('restores the initial focus after content returns', async () => {
    const { rerender } = render(<LayoutHarness hasPresentation />);

    await screen.findByText('focused');

    rerender(<LayoutHarness hasPresentation={false} />);
    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation />);
    await screen.findByText('focused');
  });

  it('applies the initial focus when the presentation is only shown later', async () => {
    const { rerender } = render(<LayoutHarness hasPresentation={false} />);

    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation />);
    await screen.findByText('focused');
  });

  it('keeps the content unfocused after a restore when the user unfocused it', async () => {
    const { rerender } = render(<LayoutHarness hasPresentation />);

    fireEvent.click(await screen.findByText('focused'));
    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation={false} />);
    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation />);
    await screen.findByText('unfocused');
  });

  // Minimising drops the current presentation altogether, so the plugin reports
  // `undefined` before it reports `false`.
  it('keeps the content unfocused when the presentation data goes undefined', async () => {
    const { rerender } = render(<LayoutHarness hasPresentation />);

    fireEvent.click(await screen.findByText('focused'));
    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation={undefined} />);
    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation={false} />);
    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation />);
    await screen.findByText('unfocused');
  });
});
