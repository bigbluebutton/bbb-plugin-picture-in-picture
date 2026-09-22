import * as React from 'react';
import {
  LayoutPresentationAreaUiDataNames,
  PluginApi,
  PresentationWhiteboardUiDataNames,
  UiLayouts,
} from 'bigbluebutton-html-plugin-sdk';
import {
  type VideoStreamsSubscriptionResult,
  SCREENSHARE,
  ScreenshareSubscriptionResult,
  VIDEO_STREAMS_SUBSCRIPTION,
  USERS_SUBSCRIPTION,
  type UsersSubscriptionResult,
} from './queries';
import { MAX_TILES } from './utils';

export const useVideoStreams = (pluginApi: PluginApi) => {
  const response = pluginApi.useCustomSubscription!<VideoStreamsSubscriptionResult>(
    VIDEO_STREAMS_SUBSCRIPTION,
  );
  return response;
};

export const useUsers = (pluginApi: PluginApi) => pluginApi.useCustomSubscription!<
  UsersSubscriptionResult
>(USERS_SUBSCRIPTION, { variables: { limit: MAX_TILES } });

export const useScreenshare = (pluginApi: PluginApi) => {
  const response = pluginApi.useCustomSubscription!<ScreenshareSubscriptionResult>(
    SCREENSHARE,
  );
  return response;
};

export const usePresentationAreaOpen = (pluginApi: PluginApi) => {
  const content = pluginApi.useUiData!(
    LayoutPresentationAreaUiDataNames.CURRENT_ELEMENT,
    [{ currentElement: UiLayouts.WHITEBOARD, isOpen: true }],
  );
  return content.some(
    (element) => element.currentElement === UiLayouts.WHITEBOARD && element.isOpen,
  );
};

const SLIDE_SNAPSHOT_INTERVAL_MS = 5000;

interface PresentationSnapshot {
  image: string | null;
  isLoading: boolean;
}

export const usePresentationSnapshot = (
  pluginApi: PluginApi,
  enabled: boolean,
  /**
   * Window whose timers drive the refresh. The main document is hidden while
   * the plugin runs and browsers throttle timers there to roughly once a
   * minute, which would stall the slide; the PiP window is visible.
   */
  pipWindow?: Window,
): PresentationSnapshot => {
  const [image, setImage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      setImage(null);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);

    const update = () => {
      const getter = pluginApi?.getUiData;
      if (!getter) {
        setIsLoading(false);
        return;
      }
      getter(PresentationWhiteboardUiDataNames.CURRENT_PAGE_SNAPSHOT).then((data) => {
        setImage(data?.base64Png ?? null);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
        // eslint-disable-next-line no-console
        console.warn('Couldn\'t refresh snapshot of current slide');
      });
    };

    update();
    const timerWindow = pipWindow ?? window;
    const intervalId = timerWindow.setInterval(update, SLIDE_SNAPSHOT_INTERVAL_MS);
    return () => {
      timerWindow.clearInterval(intervalId);
    };
  }, [pluginApi, enabled, pipWindow]);

  return { image, isLoading };
};
