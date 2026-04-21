import * as React from 'react';
import { usePipWindow } from './pip-window';

interface Rect {
  width: number;
  height: number;
  x: number;
  y: number;
}

interface LayoutContext {
  cameras: Rect;
  screenshare: Rect;
  actions: Rect;
  swapped: boolean;
  swap: () => void;
  canSwap: boolean;
}

const LayoutContext = React.createContext<LayoutContext>(null);

export function useLayoutContext(): LayoutContext {
  const layout = React.useContext(LayoutContext);
  if (!layout) {
    throw new Error('useLayoutContext must be used within a LayoutProvider');
  }
  return layout;
}

interface LayoutProviderProps {
  children: React.ReactNode;
  hasScreenshare?: boolean;
  hasCameras?: boolean;
  hasPresentation?: boolean;
  presenter?: boolean;
  moderator?: boolean;
}

export function LayoutProvider({
  children, hasScreenshare, hasCameras, hasPresentation, presenter, moderator,
}: LayoutProviderProps) {
  const pipWindow = usePipWindow();
  const [swapped, setSwapped] = React.useState<boolean | null>(null);
  const [layout, setLayout] = React.useState<Omit<LayoutContext, 'swapped' | 'swap'> | null>(null);

  const loading = [
    hasCameras, hasScreenshare, hasPresentation, presenter, moderator,
  ].some((v) => v == null);
  const swappedFromProps = (presenter || moderator)
    && (hasScreenshare || hasPresentation)
    && hasCameras;

  React.useEffect(() => {
    if (!loading) {
      setSwapped(swappedFromProps);
    }
  }, [swappedFromProps]);

  React.useEffect(() => {
    // Take undefined states into account in order to block UI rendering
    // until we know there are webcams/screenshare or not.
    if (hasCameras == null || hasScreenshare == null) return undefined;

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

      let screenshareRect: Rect = {
        x: 0, y: 0, width: 0, height: 0,
      };
      let camerasRect: Rect = {
        x: 0, y: 0, width: 0, height: 0,
      };

      const hasMedia = hasScreenshare || hasPresentation;

      if (hasMedia && hasCameras) {
        screenshareRect = {
          x: 0,
          y: 0,
          width: width * 0.7,
          height: availableHeight,
        };
        camerasRect = {
          x: width * 0.7,
          y: 0,
          width: width * 0.3,
          height: availableHeight,
        };
      } else if (hasMedia) {
        screenshareRect = {
          x: 0,
          y: 0,
          width,
          height: availableHeight,
        };
      } else if (hasCameras) {
        camerasRect = {
          x: 0,
          y: 0,
          width,
          height: availableHeight,
        };
      }

      if (swapped && hasCameras && hasMedia) {
        // Swap screenshare and cameras for presenter view
        const temp = screenshareRect;
        screenshareRect = camerasRect;
        camerasRect = temp;
      }

      setLayout((prev) => ({
        ...prev,
        actions: actionsRect,
        screenshare: screenshareRect,
        cameras: camerasRect,
      }));
    };

    handleResize();

    pipWindow.addEventListener('resize', handleResize);
    return () => {
      pipWindow.removeEventListener('resize', handleResize);
    };
  }, [pipWindow, hasScreenshare, hasCameras, hasPresentation, swapped]);

  const value = React.useMemo(
    () => (layout ? {
      ...layout,
      swapped,
      canSwap: hasCameras && (hasScreenshare || hasPresentation),
      swap: () => setSwapped((v) => !v),
    } : null),
    [layout, swapped, hasCameras, hasScreenshare, hasPresentation],
  );

  return value ? (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  ) : null;
}
