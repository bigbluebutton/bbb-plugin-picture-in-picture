import * as React from 'react';
import { usePipWindow } from './pip-window';

interface Rect {
  width: number;
  height: number;
  x: number;
  y: number;
}

interface LayoutContext {
  content: Rect;
  actions: Rect;
  contentFocused: boolean;
  toggleContentFocus: () => void;
  canFocusContent: boolean;
}

const LayoutContext = React.createContext<LayoutContext>(null);

export function useLayoutContext(): LayoutContext {
  const layout = React.useContext(LayoutContext);
  if (!layout) {
    throw new Error('useLayoutContext must be used within a LayoutProvider');
  }
  return layout;
}

/**
 * Above this many participant tiles (webcams plus avatars), content is no
 * longer focused by default. A focused slide or screenshare spans a 2x2 block:
 * with a handful of participants that is most of the window given to static
 * content, and every tile shrunk to fit around it. Toggling stays available
 * either way.
 */
const MAX_TILES_FOR_FOCUSED_CONTENT = 3;

interface LayoutProviderProps {
  children: React.ReactNode;
  hasScreenshare?: boolean;
  /**
   * Whether there is at least one participant tile (a webcam or an avatar) to
   * show next to the content. `undefined` while that is still loading.
   */
  hasTiles?: boolean;
  /** Number of participant tiles: webcams plus avatars. */
  tileCount?: number;
  hasPresentation?: boolean;
  presenter?: boolean;
  moderator?: boolean;
}

export function LayoutProvider({
  children, hasScreenshare, hasTiles, tileCount, hasPresentation, presenter, moderator,
}: LayoutProviderProps) {
  const pipWindow = usePipWindow();
  const [contentFocused, setContentFocused] = React.useState<boolean | null>(null);
  const [layout, setLayout] = React.useState<Pick<LayoutContext, 'content' | 'actions'> | null>(null);

  const loading = [
    hasTiles, hasScreenshare, hasPresentation, presenter, moderator,
  ].some((v) => v == null);
  const hasContent = Boolean(hasScreenshare || hasPresentation);
  const canFocusContent = Boolean(hasTiles && hasContent);
  const initialFocused = (presenter || moderator)
    && hasContent
    && hasTiles
    && (tileCount ?? 0) <= MAX_TILES_FOR_FOCUSED_CONTENT;

  // The initial layout is only decided once there is content AND at least one
  // participant tile to focus it against. Right after the PiP window opens its
  // subscriptions can briefly report no tile at all (the webcam list lags behind
  // the user list); deciding then would lock the layout unfocused for good.
  React.useEffect(() => {
    if (!loading && contentFocused === null && canFocusContent && typeof initialFocused === 'boolean') {
      setContentFocused(initialFocused);
    }
  }, [loading, contentFocused, canFocusContent, initialFocused]);

  React.useEffect(() => {
    if (hasTiles == null || hasScreenshare == null) return undefined;

    const handleResize = () => {
      const width = pipWindow.innerWidth;
      const height = pipWindow.innerHeight;

      const actionsHeight = 56;
      const actionsRect: Rect = {
        x: 0,
        y: height - actionsHeight,
        width,
        height: actionsHeight,
      };

      const availableHeight = height - actionsHeight;

      const contentRect: Rect = {
        x: 0,
        y: 0,
        width,
        height: availableHeight,
      };

      setLayout((prev) => ({
        ...prev,
        actions: actionsRect,
        content: contentRect,
      }));
    };

    handleResize();

    pipWindow.addEventListener('resize', handleResize);
    return () => {
      pipWindow.removeEventListener('resize', handleResize);
    };
  }, [pipWindow, hasScreenshare, hasTiles]);

  const value = React.useMemo<LayoutContext | null>(
    () => (layout ? {
      ...layout,
      // The focus preference is kept while there is nothing to focus, so it is
      // restored as soon as the content comes back.
      contentFocused: canFocusContent && Boolean(contentFocused),
      canFocusContent,
      toggleContentFocus: () => setContentFocused((v) => !v),
    } : null),
    [layout, contentFocused, canFocusContent],
  );

  return value ? (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  ) : null;
}
