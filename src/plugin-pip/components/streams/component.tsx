import * as React from 'react';
import { useEffect } from 'react';
import { PluginApi } from 'bigbluebutton-html-plugin-sdk';
import {
  useVideoStreams, useScreenshare, usePresentationSnapshot, useUsers,
} from './hooks';
import WebcamItem from './webcam-item';
import AvatarItem from './avatar-item';
import Video from './video';
import Skeleton from '../ui/skeleton';
import {
  availableAvatarSlots,
  FALLBACK_ASPECT_RATIO,
  findOptimalGrid,
  extractVideoStreamIds,
  isStreamLive,
} from './utils';
import {
  SCREENSHARE_VIDEO_SELECTOR,
  VIDEO_LIST_CLASSNAME,
  createVideoSelector,
  getVideoListContainer,
  reportMissingSelector,
} from '../../../common/bbb-selectors';
import { useLayoutContext } from '../contexts/layout';
import { usePipWindow } from '../contexts/pip-window';
import { useRerenderRef } from '../../../common/hooks';

const POLL_TIMEOUT = 5000; // 5 seconds

/**
 * Shorter wait for an element that exists but whose stream is not delivering
 * frames: the client keeps the element around while it reconnects, so either a
 * fresh stream shows up within this window or the tile keeps its last frame
 * and the grid retries on the next pass.
 */
const STALLED_POLL_TIMEOUT = 2000;

/**
 * Delay between iterations of the polling loops. Zero-delay scheduling would
 * query the client DOM hundreds of times a second; media takes visible time to
 * attach anyway, so a cadence well under a second costs nothing perceptible.
 */
const POLL_INTERVAL_MS = 150;

/**
 * Timers for the polling loops below.
 *
 * These run while the main document is hidden - that is the whole point of the
 * plugin - and browsers throttle timers in a backgrounded page to roughly once
 * a minute. Scheduling on the PiP window instead keeps them on a page that is
 * visible, so the loops run at full speed. Falls back to the global timers if
 * no window was provided, and stops once the PiP window is gone.
 */
const scheduler = (pipWindow?: Window) => ({
  now: () => (pipWindow?.performance ?? performance).now(),
  isGone: () => Boolean(pipWindow?.closed),
  schedule: (callback: () => void) => {
    (pipWindow ?? window).setTimeout(callback, POLL_INTERVAL_MS);
  },
});

const pollForVideoSrc = (
  streamId: string,
  container: Element | null | undefined,
  pipWindow?: Window,
): Promise<MediaStream | null> => new Promise((resolve) => {
  const timers = scheduler(pipWindow);
  const start = timers.now();
  const selector = createVideoSelector(streamId);
  const root = container ?? document.body;

  const poll = () => {
    // The window this loop is scheduled on is gone; stop rather than leave the
    // promise - and everything awaiting it - pending forever.
    if (timers.isGone()) return resolve(null);
    const element = root.querySelector(selector);
    const stream = element instanceof HTMLVideoElement && element.srcObject instanceof MediaStream
      ? element.srcObject
      : null;
    // Only a live stream settles the poll early. Accepting any srcObject here
    // used to re-adopt the very stream whose stall triggered this resolution,
    // which made every stall permanent.
    if (stream && isStreamLive(stream)) return resolve(stream);
    const elapsed = timers.now() - start;
    // The element exists but its stream is not delivering. Give the client a
    // short window to swap in a fresh one, then settle for the stalled stream:
    // it still shows its last frame, and the grid schedules a retry for as
    // long as any tile stays in this state.
    if (stream && elapsed > STALLED_POLL_TIMEOUT) return resolve(stream);
    if (elapsed > POLL_TIMEOUT) {
      reportMissingSelector(
        createVideoSelector('<streamId>'),
        `no <video> appeared for stream ${streamId}`,
      );
      return resolve(null);
    }
    return timers.schedule(poll);
  };

  poll();
});

const pollForScreenshareSrc = (pipWindow?: Window): Promise<MediaProvider | null> => new Promise(
  (resolve) => {
    const timers = scheduler(pipWindow);
    const start = timers.now();

    const poll = () => {
      if (timers.isGone()) return resolve(null);
      const timestamp: number = timers.now();
      const element = document.querySelector(SCREENSHARE_VIDEO_SELECTOR);
      if (element && element instanceof HTMLVideoElement && element.srcObject) {
        return resolve(element.srcObject);
      }
      if (timestamp - start > POLL_TIMEOUT) {
        reportMissingSelector(SCREENSHARE_VIDEO_SELECTOR, 'screenshare is active but has no <video>');
        return resolve(null);
      }
      return timers.schedule(poll);
    };

    poll();
  },
);

/** Losing one publisher mutes several tracks at once; coalesce into one refresh. */
const STALLED_REFRESH_DEBOUNCE_MS = 300;

/**
 * While any rendered tile holds a stalled stream, re-resolve on this cadence.
 * The client recovering means it swaps a fresh MediaStream into its own
 * <video> element - a property write that no MutationObserver or subscription
 * ever reports - so polling is the only signal available.
 */
const STALLED_RETRY_MS = 3000;

interface WebcamMedia {
  type: 'webcam';
  srcObject: MediaStream;
  streamId: string;
  userName: string;
  userId: string;
  userTalking: boolean;
  /**
   * Visual position in the grid, applied through the CSS 'order' property.
   * Tiles are rendered in a deliberately stable DOM order instead: React
   * moving a live <video> element is not state-preserving in Chromium and can
   * leave the moved tile frozen on its last frame.
   */
  order: number;
}

interface ScreenshareMedia {
  type: 'screenshare';
  srcObject: MediaProvider;
  streamId: string;
}

interface SlideMedia {
  type: 'slide';
  streamId: string;
  image: string;
}

interface SlideLoadingMedia {
  type: 'slide-loading';
  streamId: string;
}

interface AvatarMedia {
  type: 'avatar';
  streamId: string;
  userName: string | null;
  avatar: string | null;
  color: string | null;
  userTalking: boolean;
  order: number;
}

type GridMedia =
  | WebcamMedia
  | ScreenshareMedia
  | SlideMedia
  | SlideLoadingMedia
  | AvatarMedia;

const SLIDE_STREAM_ID = 'presentation-slide';
const SLIDE_LOADING_STREAM_ID = 'presentation-slide-loading';

interface StreamsComponentProps {
  pluginApi: PluginApi;
  hasPresentation?: boolean;
}

function StreamsComponent({
  pluginApi,
  hasPresentation,
}: StreamsComponentProps): React.ReactNode {
  const [streams, setStreams] = React.useState<GridMedia[]>([]);
  const [loading, setLoading] = React.useState(true);
  // A counter rather than Date.now(): two refresh requests within the same
  // millisecond would produce identical values and React would drop the second.
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [aspectRatio, setAspectRatio] = React.useState(FALLBACK_ASPECT_RATIO);
  const { content: contentRect, contentFocused } = useLayoutContext();
  const pipWindow = usePipWindow();
  const camerasRef = useRerenderRef<HTMLDivElement>(null);
  const webcamsRef = useRerenderRef<HTMLDivElement>(null);
  // Streams already resolved from the client DOM, kept across refreshes so
  // tiles that are already playing skip pollForVideoSrc entirely. Only
  // successful resolutions are cached: a camera the client never renders
  // (paginated away) resolves to null, is evicted below, and pays the full
  // poll timeout again on every refresh.
  const resolvedStreamsRef = React.useRef<Map<string, MediaStream>>(new Map());
  const stalledTimeoutRef = React.useRef<number | null>(null);
  const observerRef = React.useRef<MutationObserver | null>(null);
  const observedNodeRef = React.useRef<Element | null>(null);

  const requestRefresh = React.useCallback(() => setRefreshTick((tick) => tick + 1), []);

  /**
   * A tile reported that its stream stopped delivering frames. Drop it from the
   * cache so the next resolution really re-reads the client DOM, and schedule
   * that resolution. Debounced because losing one publisher usually mutes
   * several tracks at once, and one refresh answers all of them. Scheduled on
   * the PiP window's timers: the main document is hidden, and its throttled
   * timers would sit on this for a second or more.
   */
  const handleStreamStalled = React.useCallback((streamId: string) => {
    resolvedStreamsRef.current.delete(streamId);

    if (stalledTimeoutRef.current !== null) pipWindow.clearTimeout(stalledTimeoutRef.current);
    stalledTimeoutRef.current = pipWindow.setTimeout(() => {
      stalledTimeoutRef.current = null;
      requestRefresh();
    }, STALLED_REFRESH_DEBOUNCE_MS);
  }, [pipWindow, requestRefresh]);

  useEffect(() => () => {
    if (stalledTimeoutRef.current !== null) pipWindow.clearTimeout(stalledTimeoutRef.current);
  }, [pipWindow]);

  /**
   * Point the MutationObserver at the client's current video list.
   *
   * The node used to be resolved once, so if the client ever replaced that
   * element the observer would be left watching a detached node and the grid
   * would silently stop refreshing - forever, with no error anywhere. This
   * revalidates identity and connectedness instead, and is cheap enough to run
   * on every resolution pass.
   */
  const ensureObservingVideoList = React.useCallback(() => {
    const targetNode = getVideoListContainer();
    const observed = observedNodeRef.current;

    if (observed === targetNode && (!observed || observed.isConnected)) return;

    observerRef.current?.disconnect();
    observedNodeRef.current = targetNode;

    if (!targetNode) return;

    if (!observerRef.current) {
      observerRef.current = new MutationObserver(requestRefresh);
    }
    observerRef.current.observe(targetNode, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }, [requestRefresh]);

  const {
    data: videoStreamsData,
  } = useVideoStreams(pluginApi);

  const {
    data: screenshareData,
  } = useScreenshare(pluginApi);

  const {
    data: usersData,
  } = useUsers(pluginApi);

  const isSharing = Boolean(screenshareData?.screenshare[0]?.stream);
  const slideEnabled = Boolean(hasPresentation) && !isSharing;
  const { image: slideImage, isLoading: slideLoading } = usePresentationSnapshot(
    pluginApi,
    slideEnabled,
    pipWindow,
  );

  useEffect(() => {
    // update() can take seconds (pollForVideoSrc waits for the client to render
    // a <video>), so a newer run can start while this one is still pending.
    // Without this guard the slower, older run would publish last and overwrite
    // fresh streams with stale ones - both in the rendered state and in the
    // shared resolved-stream cache.
    let cancelled = false;

    async function update() {
      // Cheap, and the only thing that keeps the observer from silently dying
      // if the client re-creates its video list.
      ensureObservingVideoList();
      const videoList = getVideoListContainer();
      const videoStreamIds = extractVideoStreamIds(videoList);
      const videoIndexes = Object.fromEntries(videoStreamIds
        .map((streamId, index) => [streamId, index] as [string, number]));
      const cameraStreams = videoStreamsData?.user_camera || [];

      // Absent with nobody sharing is normal; absent while cameras exist is not.
      if (cameraStreams.length && !videoList) {
        reportMissingSelector(`.${VIDEO_LIST_CLASSNAME}`, 'cameras are being shared but the list is missing');
      }

      // Cameras that went away must not keep an entry - and must not keep a
      // dead MediaStream alive either.
      const currentStreamIds = new Set(cameraStreams.map((stream) => stream.streamId));
      resolvedStreamsRef.current.forEach((_stream, streamId) => {
        if (!currentStreamIds.has(streamId)) resolvedStreamsRef.current.delete(streamId);
      });

      const videoSrc = cameraStreams.map(
        async (stream) => {
          const cached = resolvedStreamsRef.current.get(stream.streamId);
          // Only poll for streams we do not already hold a live handle to.
          const srcObject = cached && isStreamLive(cached)
            ? cached
            : await pollForVideoSrc(stream.streamId, videoList, pipWindow);

          if (srcObject) {
            // A superseded run must not touch the shared cache either: it could
            // overwrite a fresher stream the newer run just resolved.
            if (!cancelled) resolvedStreamsRef.current.set(stream.streamId, srcObject);
            return {
              type: 'webcam' as const,
              streamId: stream.streamId,
              userName: stream.user?.name,
              userId: stream.user?.userId,
              userTalking: stream.voice?.talking,
              // Mirrors the client's own ordering; streams the client is not
              // rendering go last.
              order: videoIndexes[stream.streamId] ?? videoStreamIds.length,
              srcObject,
            };
          }

          // Same for eviction: a cancelled run timing out must not evict an
          // entry the newer run has meanwhile resolved.
          if (!cancelled) resolvedStreamsRef.current.delete(stream.streamId);
          return null;
        },
      );

      const videoResolved = await Promise.all(videoSrc);
      // DOM order is deliberately stable across refreshes - the client's
      // activity-based ordering lives in each tile's 'order' field instead.
      // Mirroring it here would make React physically move <video> elements
      // whenever someone talks, and a same-document move is not
      // state-preserving for media elements: the moved tile can come out
      // paused, frozen on its last frame.
      const webcams: GridMedia[] = videoResolved
        .filter((v) => v)
        .sort((a, b) => a.streamId.localeCompare(b.streamId));

      if (isSharing) {
        const srcObject = await pollForScreenshareSrc(pipWindow);
        if (srcObject) {
          const screenshareItem: ScreenshareMedia = {
            type: 'screenshare',
            streamId: screenshareData.screenshare[0].stream,
            srcObject,
          };
          return [screenshareItem, ...webcams];
        }
      }

      if (slideImage) {
        const slideItem: SlideMedia = {
          type: 'slide',
          streamId: SLIDE_STREAM_ID,
          image: slideImage,
        };
        return [slideItem, ...webcams];
      }

      if (slideEnabled && slideLoading) {
        const slideLoadingItem: SlideLoadingMedia = {
          type: 'slide-loading',
          streamId: SLIDE_LOADING_STREAM_ID,
        };
        return [slideLoadingItem, ...webcams];
      }

      return webcams;
    }

    let retryTimer: number | null = null;

    setLoading(true);
    update()
      .then((nextStreams) => {
        if (cancelled) return;
        setStreams(nextStreams);
        // A stalled tile keeps its last frame and produces no further events,
        // and the client swapping in a fresh stream is invisible to every
        // other trigger - so keep re-resolving until nothing is stalled.
        const hasStalledStream = nextStreams.some(
          (item) => item.type === 'webcam' && !isStreamLive(item.srcObject),
        );
        if (hasStalledStream) {
          retryTimer = pipWindow.setTimeout(requestRefresh, STALLED_RETRY_MS);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (retryTimer !== null) pipWindow.clearTimeout(retryTimer);
    };
  }, [videoStreamsData, screenshareData, slideImage, slideLoading, slideEnabled, refreshTick,
    ensureObservingVideoList, pipWindow, requestRefresh]);

  // Avatars need no async resolution, so they are derived straight from the
  // subscription instead of going through `update()` — otherwise every
  // `voice.talking` flap would re-run the DOM polling above.
  const avatars = React.useMemo<Omit<AvatarMedia, 'order'>[]>(() => (usersData?.user || [])
    .map((user) => ({
      type: 'avatar' as const,
      streamId: `avatar-${user.userId}`,
      userName: user.name,
      avatar: user.avatar,
      color: user.color,
      userTalking: user.voice?.talking ?? false,
    })), [usersData]);

  // Every entry in `streams` already owns a grid cell — the webcams AND the
  // presentation/screenshare tile — so the cap has to be measured against all of
  // them, not just the webcams. Counting webcams alone let a meeting with a
  // presentation overshoot MAX_TILES by the number of content tiles.
  const tiles = React.useMemo<GridMedia[]>(
    () => {
      const lastWebcamOrder = streams.reduce((highestOrder, item) => (
        item.type === 'webcam' ? Math.max(highestOrder, item.order) : highestOrder
      ), -1);
      const orderedAvatars = avatars
        .slice(0, availableAvatarSlots(streams.length))
        .map((avatar, index) => ({ ...avatar, order: lastWebcamOrder + index + 1 }));

      return [...streams, ...orderedAvatars];
    },
    [streams, avatars],
  );

  useEffect(() => {
    ensureObservingVideoList();

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedNodeRef.current = null;
    };
  }, [ensureObservingVideoList]);

  // Tiles are laid out to the shape of the video actually being published
  // rather than to a fixed guess, which would letterbox every tile and waste a
  // large slice of an already small window.
  useEffect(() => {
    const firstWebcam = streams.find((item) => item.type === 'webcam') as WebcamMedia | undefined;
    if (!firstWebcam) return;

    const settings = firstWebcam.srcObject.getVideoTracks()[0]?.getSettings();
    if (settings?.width && settings?.height) {
      setAspectRatio(settings.width / settings.height);
      return;
    }

    // Remote tracks often report no dimensions, so fall back to what the
    // client's own element resolved.
    const element = getVideoListContainer()
      ?.querySelector(createVideoSelector(firstWebcam.streamId));
    if (element instanceof HTMLVideoElement && element.videoWidth && element.videoHeight) {
      setAspectRatio(element.videoWidth / element.videoHeight);
    }
  }, [streams]);

  const paddingInline = camerasRef.current ? parseInt(pipWindow.getComputedStyle(camerasRef.current)
    .getPropertyValue('padding-inline'), 10) : 8;
  const paddingBlock = camerasRef.current ? parseInt(pipWindow.getComputedStyle(camerasRef.current)
    .getPropertyValue('padding-block'), 10) : 8;

  const gridGutter = webcamsRef.current ? parseInt(window.getComputedStyle(webcamsRef.current)
    .getPropertyValue('grid-row-gap'), 10) : 6;

  // While streams are still resolving, size the grid to what the subscription
  // already reports rather than to a fixed guess of four, so the layout does
  // not visibly rearrange the moment the real streams arrive.
  const pendingItemCount = (videoStreamsData?.user_camera?.length ?? 0)
    + (isSharing || slideEnabled ? 1 : 0);
  const gridItemCount = tiles.length || pendingItemCount || 4;

  const optimalGrid = React.useMemo(() => findOptimalGrid(
    {
      width: contentRect.width - (paddingInline * 2),
      height: contentRect.height - (paddingBlock * 2),
    },
    gridItemCount,
    gridGutter,
    contentFocused,
    aspectRatio,
  ), [contentRect, gridItemCount, paddingInline, paddingBlock, contentFocused, aspectRatio]);

  if (!tiles.length && !loading) {
    return null;
  }

  const style: React.CSSProperties = {
    width: `${optimalGrid.width}px`,
    height: `${optimalGrid.height}px`,
    gridTemplateColumns: `repeat(${optimalGrid.columns}, 1fr)`,
    gridTemplateRows: `repeat(${optimalGrid.rows}, 1fr)`,
  };

  return (
    <div
      className="cameras"
      ref={camerasRef}
      style={{
        position: 'absolute',
        left: contentRect.x,
        top: contentRect.y,
        width: contentRect.width,
        height: contentRect.height,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div id="plugin-pip-webcams" className="webcams" style={style} ref={webcamsRef}>
        {loading && !tiles.length ? Array.from({ length: gridItemCount }).map((_e, i) => i).map((i) => <Skeleton height="unset" key={i} />) : tiles.map((item) => {
          if (item.type === 'screenshare') {
            const className = ['pip-video-container', 'pip-screenshare-item'];
            if (contentFocused) className.push('pip-content-focused');
            return (
              <div key={item.streamId} className={className.join(' ')} style={{ order: -1 }}>
                <Video srcObject={item.srcObject} talking={false} />
              </div>
            );
          }
          if (item.type === 'slide') {
            const className = ['pip-video-container', 'pip-slide-item'];
            if (contentFocused) className.push('pip-content-focused');
            return (
              <div key={item.streamId} className={className.join(' ')} style={{ order: -1 }}>
                <img src={item.image} alt="current slide" />
              </div>
            );
          }
          if (item.type === 'slide-loading') {
            const className = ['pip-video-container', 'pip-slide-item'];
            if (contentFocused) className.push('pip-content-focused');
            return (
              <div key={item.streamId} className={className.join(' ')} style={{ order: -1 }}>
                <Skeleton width="100%" height="100%" borderRadius={0} />
              </div>
            );
          }
          if (item.type === 'avatar') {
            return (
              <AvatarItem
                key={item.streamId}
                userName={item.userName}
                avatar={item.avatar}
                color={item.color}
                userTalking={item.userTalking}
                order={item.order}
              />
            );
          }
          return (
            <WebcamItem
              key={item.streamId}
              streamId={item.streamId}
              srcObject={item.srcObject}
              userTalking={item.userTalking}
              userName={item.userName}
              order={item.order}
              onStalled={() => handleStreamStalled(item.streamId)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default StreamsComponent;
