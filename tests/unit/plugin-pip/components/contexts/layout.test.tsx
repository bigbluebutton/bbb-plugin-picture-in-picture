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
  /** Webcams plus avatars; `undefined` while the participants are loading. */
  tileCount?: number | null;
}

function LayoutHarness({ hasPresentation, tileCount = 1 }: LayoutHarnessProps) {
  const count = tileCount ?? undefined;
  return (
    <PipWindowProvider pipWindow={window}>
      <LayoutProvider
        hasTiles={count === undefined ? undefined : count > 0}
        tileCount={count}
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

  // Participants without a camera are rendered as avatar tiles, which the
  // content can be focused against just like webcams.
  it('focuses the content when the only participant tiles are avatars', async () => {
    render(<LayoutHarness hasPresentation tileCount={2} />);

    await screen.findByText('focused');
  });

  it('cannot focus the content when there is no participant tile at all', async () => {
    render(<LayoutHarness hasPresentation tileCount={0} />);

    fireEvent.click(await screen.findByText('unfocused'));
    await screen.findByText('unfocused');
  });

  it('leaves the content unfocused by default in a crowded meeting', async () => {
    render(<LayoutHarness hasPresentation tileCount={4} />);

    fireEvent.click(await screen.findByText('unfocused'));
    await screen.findByText('focused');
  });

  it('waits for the participant count before deciding the initial focus', async () => {
    const { rerender } = render(<LayoutHarness hasPresentation tileCount={null} />);

    rerender(<LayoutHarness hasPresentation tileCount={2} />);
    await screen.findByText('focused');
  });

  it('applies the initial focus when the first participant tile shows up late', async () => {
    const { rerender } = render(<LayoutHarness hasPresentation tileCount={0} />);

    await screen.findByText('unfocused');

    rerender(<LayoutHarness hasPresentation tileCount={1} />);
    await screen.findByText('focused');
  });
});
