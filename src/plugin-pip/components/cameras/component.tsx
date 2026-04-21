import * as React from 'react';
import { useEffect } from 'react';
import { PluginApi } from 'bigbluebutton-html-plugin-sdk';
import { useVideoStreams } from './hooks';
import VideoItem from './video-item';
import Skeleton from '../ui/skeleton';
import { range } from './utils';
import { useLayoutContext } from '../contexts/layout';
import { usePipWindow } from '../contexts/pip-window';
import { useRerenderRef } from '../../../common/hooks';

const createVideoSelector = (streamId: string) => `.video-provider_list .videoContainer[data-stream="${streamId}"] video`;

const pollForVideoSrc = (
  streamId: string,
  container: Element = document.body,
): Promise<MediaStream | null> => new Promise((resolve) => {
  const TIMEOUT = 5000; // 5 seconds
  const start = performance.now();
  const selector = createVideoSelector(streamId);

  const poll = () => {
    const timestamp: number = performance.now();
    const element = container.querySelector(selector);
    if (element && element instanceof HTMLVideoElement && element.srcObject) {
      return resolve(element.srcObject as MediaStream);
    }
    if (timestamp - start > TIMEOUT) {
      return resolve(null);
    }
    return setTimeout(poll);
  };

  setTimeout(poll);
});

const ASPECT_RATIO = 4 / 3;

const calculateOptimalGrid = (
  canvasWidth: number,
  canvasHeight: number,
  gutter: number,
  aspectRatio: number,
  numItems: number,
  columns = 1,
) => {
  const rows = Math.ceil(numItems / columns);
  const gutterTotalWidth = (columns - 1) * gutter;
  const gutterTotalHeight = (rows - 1) * gutter;
  const usableWidth = canvasWidth - gutterTotalWidth;
  const usableHeight = canvasHeight - gutterTotalHeight;
  let cellWidth = Math.floor(usableWidth / columns);
  let cellHeight = Math.ceil(cellWidth / aspectRatio);
  if ((cellHeight * rows) > usableHeight) {
    cellHeight = Math.floor(usableHeight / rows);
    cellWidth = Math.ceil(cellHeight * aspectRatio);
  }
  return {
    columns,
    rows,
    width: (cellWidth * columns) + gutterTotalWidth,
    height: (cellHeight * rows) + gutterTotalHeight,
    filledArea: (cellWidth * cellHeight) * numItems,
  };
};

const findOptimalGrid = (
  gridRect: { width: number; height: number } | null,
  numItems: number,
  gutter: number,
) => {
  if (numItems < 1) {
    return {
      rows: 0,
      filledArea: 0,
      columns: 0,
      height: 0,
      width: 0,
    };
  }

  const canvasWidth = gridRect?.width ?? 0;
  const canvasHeight = gridRect?.height ?? 0;

  const newOptimalGrid = range(1, numItems + 1)
    .reduce((currentGrid, col) => {
      const testGrid = calculateOptimalGrid(
        canvasWidth,
        canvasHeight,
        gutter,
        ASPECT_RATIO,
        numItems,
        col,
      );
      const betterThanCurrent = testGrid.filledArea > currentGrid.filledArea;
      return betterThanCurrent ? testGrid : currentGrid;
    }, {
      rows: 0,
      filledArea: 0,
      columns: 0,
      height: 0,
      width: 0,
    });

  return newOptimalGrid;
};

const extractVideoStreamIds = (container: Element | null): string[] => {
  const items = container ? Array.from(container.querySelectorAll('.videoContainer')) : [];
  return items.map((item) => item.getAttribute('data-stream'));
};

const VIDEO_LIST_CLASSNAME = 'video-provider_list';

interface Media {
  srcObject: MediaStream;
  streamId: string;
  userName: string;
  userId: string;
  userTalking: boolean;
}

interface CamerasComponentProps {
  pluginApi: PluginApi;
}

function CamerasComponent({ pluginApi }: CamerasComponentProps): React.ReactNode {
  const [videos, setVideos] = React.useState<Media[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdate, setLastUpdate] = React.useState(Date.now());
  const { cameras: camerasRect } = useLayoutContext();
  const pipWindow = usePipWindow();
  const camerasRef = useRerenderRef<HTMLDivElement>(null);
  const webcamsRef = useRerenderRef<HTMLDivElement>(null);

  const {
    data: videoStreamsData,
  } = useVideoStreams(pluginApi);

  useEffect(() => {
    async function update() {
      const videoList = document.getElementsByClassName(VIDEO_LIST_CLASSNAME)[0];
      const videoStreamIds = extractVideoStreamIds(videoList);
      const videoIndexes = Object.fromEntries(Object.entries(videoStreamIds)
        .map(([index, streamId]) => ([streamId, Number.parseInt(index, 10)])));
      const streams = videoStreamsData?.user_camera || [];

      const videoSrc = streams.map(
        async (stream) => {
          const srcObject = await pollForVideoSrc(stream.streamId, videoList);

          if (srcObject) {
            return {
              streamId: stream.streamId,
              userName: stream.user?.name,
              userId: stream.user?.userId,
              userTalking: stream.voice?.talking,
              srcObject,
            };
          }

          return null;
        },
      );

      const videoResolved = await Promise.all(videoSrc);
      const actualVideos = videoResolved.filter((v) => v).sort((a, b) => {
        const indexA = videoIndexes[a.streamId] ?? 0;
        const indexB = videoIndexes[b.streamId] ?? 0;
        return indexA - indexB;
      });
      return actualVideos;
    }

    setLoading(true);
    update()
      .then(setVideos)
      .finally(() => {
        setLoading(false);
      });
  }, [videoStreamsData, lastUpdate]);

  useEffect(() => {
    const targetNode = document.getElementsByClassName(VIDEO_LIST_CLASSNAME)[0];
    const config = { attributes: true, childList: true, subtree: true };

    const callback = () => {
      setLastUpdate(Date.now());
    };

    const observer = new MutationObserver(callback);

    if (targetNode) observer.observe(targetNode, config);

    return () => {
      observer.disconnect();
    };
  }, [videoStreamsData]);

  const paddingInline = camerasRef.current ? parseInt(pipWindow.getComputedStyle(camerasRef.current)
    .getPropertyValue('padding-inline'), 10) : 8;
  const paddingBlock = camerasRef.current ? parseInt(pipWindow.getComputedStyle(camerasRef.current)
    .getPropertyValue('padding-block'), 10) : 8;

  const gridGutter = webcamsRef.current ? parseInt(window.getComputedStyle(webcamsRef.current)
    .getPropertyValue('grid-row-gap'), 10) : 6;

  const optimalGrid = React.useMemo(() => findOptimalGrid(
    {
      width: camerasRect.width - (paddingInline * 2),
      height: camerasRect.height - (paddingBlock * 2),
    },
    videos.length || 4,
    gridGutter,
  ), [camerasRect, videos.length, paddingInline, paddingBlock]);

  if (!videos.length && !loading) {
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
        left: camerasRect.x,
        top: camerasRect.y,
        width: camerasRect.width,
        height: camerasRect.height,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div id="plugin-pip-webcams" className="webcams" style={style} ref={webcamsRef}>
        {loading && !videos.length ? Array.from({ length: 4 }).map(() => <Skeleton height="unset" />) : videos.map((video) => (
          <VideoItem
            key={video.streamId}
            streamId={video.streamId}
            srcObject={video.srcObject}
            userTalking={video.userTalking}
            userName={video.userName}
          />
        ))}
      </div>
    </div>
  );
}

export default CamerasComponent;
