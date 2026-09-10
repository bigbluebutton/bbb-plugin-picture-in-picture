export function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += 1) {
    result.push(i);
  }
  return result;
}

/**
 * Used until a real video reports its own dimensions. 16:9 matches both the
 * shape of the PiP window the plugin requests and what webcams typically
 * publish; a 4:3 grid inside a 16:9 window wastes about a third of the width.
 */
export const FALLBACK_ASPECT_RATIO = 16 / 9;

/**
 * Hard ceiling for the number of cells in the PiP grid. It covers EVERY cell —
 * webcams, the presentation/screenshare tile and the avatars — not just the
 * webcams, so the grid never grows past this many tiles.
 */
export const MAX_TILES = 10;

/**
 * How many avatar tiles still fit once the streams that already own a cell
 * (webcams plus the presentation/screenshare tile) are accounted for.
 */
export const availableAvatarSlots = (
  occupiedCells: number,
  maxTiles: number = MAX_TILES,
): number => Math.max(0, maxTiles - occupiedCells);

export const createVideoSelector = (streamId: string) => `.video-provider_list .videoContainer[data-stream="${streamId}"] video`;

export const calculateOptimalGrid = (
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

export const findOptimalGrid = (
  gridRect: { width: number; height: number } | null,
  numItems: number,
  gutter: number,
  contentFocused = false,
  aspectRatio: number = FALLBACK_ASPECT_RATIO,
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

  const effectiveItems = contentFocused ? numItems + 3 : numItems;
  const minColumns = contentFocused ? 2 : 1;

  const newOptimalGrid = range(minColumns, effectiveItems + 1)
    .reduce((currentGrid, col) => {
      const testGrid = calculateOptimalGrid(
        canvasWidth,
        canvasHeight,
        gutter,
        aspectRatio,
        effectiveItems,
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

export const extractVideoStreamIds = (container: Element | null): string[] => {
  const items = container ? Array.from(container.querySelectorAll('.videoContainer')) : [];
  return items
    .map((item) => item.getAttribute('data-stream'))
    .filter((streamId): streamId is string => streamId !== null);
};

/**
 * A stream is worth rendering only while it can still deliver frames. Two
 * failure shapes matter here: a track that ENDED is gone for good, and a track
 * that is MUTED has stopped receiving media - its readyState stays 'live' and
 * stream.active stays true, so only the muted flag betrays it. Both render as
 * a frozen last frame on an otherwise healthy-looking element, which is why
 * both have to be checked explicitly.
 */
export const isStreamLive = (stream: MediaStream): boolean => stream.active
  && stream.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted);
