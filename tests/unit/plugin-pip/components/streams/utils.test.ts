import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import {
  FALLBACK_ASPECT_RATIO,
  MAX_TILES,
  availableAvatarSlots,
  calculateOptimalGrid,
  extractVideoStreamIds,
  findOptimalGrid,
  isStreamLive,
  range,
} from '../../../../../src/plugin-pip/components/streams/utils';
import { createVideoSelector } from '../../../../../src/common/bbb-selectors';

describe('range', () => {
  it('returns the half-open interval [start, end)', () => {
    expect(range(0, 3)).toEqual([0, 1, 2]);
    expect(range(2, 5)).toEqual([2, 3, 4]);
  });

  it('returns an empty array when start >= end', () => {
    expect(range(3, 3)).toEqual([]);
    expect(range(5, 2)).toEqual([]);
  });

  it('supports negative starts', () => {
    expect(range(-2, 1)).toEqual([-2, -1, 0]);
  });
});

// These exercise the geometry at a fixed ratio, so they pass one explicitly
// rather than depending on whatever the current default happens to be.
const FOUR_THIRDS = 4 / 3;

describe('calculateOptimalGrid', () => {
  it('fills a single cell to the full canvas at the 4:3 aspect ratio', () => {
    const grid = calculateOptimalGrid(400, 300, 0, FOUR_THIRDS, 1, 1);
    expect(grid).toEqual({
      columns: 1,
      rows: 1,
      width: 400,
      height: 300,
      filledArea: 120000,
    });
  });

  it('splits two items across two columns in a single row', () => {
    const grid = calculateOptimalGrid(400, 300, 0, FOUR_THIRDS, 2, 2);
    expect(grid).toEqual({
      columns: 2,
      rows: 1,
      width: 400,
      height: 150,
      filledArea: 60000,
    });
  });

  it('accounts for the gutter between columns and rows', () => {
    const grid = calculateOptimalGrid(400, 300, 10, FOUR_THIRDS, 4, 2);
    // 4 items in 2 columns -> 2 rows; the row height constraint shrinks the
    // cell so the grid fits: cellHeight=145, cellWidth=194.
    expect(grid).toEqual({
      columns: 2,
      rows: 2,
      width: 398,
      height: 300,
      filledArea: 194 * 145 * 4,
    });
  });
});

describe('findOptimalGrid', () => {
  it('returns a zeroed grid when there are no items', () => {
    expect(findOptimalGrid({ width: 400, height: 300 }, 0, 0)).toEqual({
      rows: 0,
      filledArea: 0,
      columns: 0,
      height: 0,
      width: 0,
    });
    expect(findOptimalGrid({ width: 400, height: 300 }, -1, 0)).toEqual({
      rows: 0,
      filledArea: 0,
      columns: 0,
      height: 0,
      width: 0,
    });
  });

  it('picks a single column for a single item in a non-focused grid', () => {
    const grid = findOptimalGrid({ width: 400, height: 300 }, 1, 0, false);
    // Defaults to 16:9, so the cell is width-bound: 400 wide, 225 tall.
    expect(grid).toEqual({
      columns: 1,
      rows: 1,
      width: 400,
      height: 225,
      filledArea: 90000,
    });
  });

  it('lays the grid out to an explicit aspect ratio when given one', () => {
    const wide = findOptimalGrid({ width: 400, height: 300 }, 1, 0, false);
    const fourThirds = findOptimalGrid({ width: 400, height: 300 }, 1, 0, false, FOUR_THIRDS);

    expect(fourThirds).toEqual({
      columns: 1,
      rows: 1,
      width: 400,
      height: 300,
      filledArea: 120000,
    });
    // A 4:3 tile uses the full canvas height where the 16:9 default cannot.
    expect(fourThirds.height).toBeGreaterThan(wide.height);
  });

  it('exports a 16:9 fallback, matching the shape of the PiP window', () => {
    expect(FALLBACK_ASPECT_RATIO).toBeCloseTo(16 / 9);
  });

  it('treats a null gridRect as a zero-sized canvas', () => {
    const grid = findOptimalGrid(null, 2, 0, false);
    expect(grid.width).toBe(0);
    expect(grid.height).toBe(0);
    expect(grid.filledArea).toBe(0);
  });

  it('uses at least two columns and pads item count when content-focused', () => {
    const grid = findOptimalGrid({ width: 800, height: 600 }, 1, 0, true);
    expect(grid.columns).toBeGreaterThanOrEqual(2);
    expect(grid.filledArea).toBeGreaterThan(0);
  });
});

describe('createVideoSelector', () => {
  it('builds a scoped selector for the given stream id', () => {
    expect(createVideoSelector('abc')).toBe('.video-provider_list .videoContainer[data-stream="abc"] video');
  });
});

describe('extractVideoStreamIds', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('returns an empty array for a null container', () => {
    expect(extractVideoStreamIds(null)).toEqual([]);
  });

  it('returns an empty array when there are no video containers', () => {
    expect(extractVideoStreamIds(container)).toEqual([]);
  });

  it('collects the data-stream attribute of each video container in order', () => {
    container.innerHTML = `
      <div class="videoContainer" data-stream="s1"></div>
      <div class="videoContainer" data-stream="s2"></div>
    `;
    expect(extractVideoStreamIds(container)).toEqual(['s1', 's2']);
  });

  it('skips video containers without a data-stream attribute', () => {
    container.innerHTML = `
      <div class="videoContainer" data-stream="s1"></div>
      <div class="videoContainer"></div>
      <div class="videoContainer" data-stream="s2"></div>
    `;
    expect(extractVideoStreamIds(container)).toEqual(['s1', 's2']);
  });
});

describe('isStreamLive', () => {
  const makeStream = (
    active: boolean,
    tracks: Array<Partial<MediaStreamTrack>>,
  ): MediaStream => ({
    active,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream);

  it('accepts an active stream with a live, unmuted video track', () => {
    expect(isStreamLive(makeStream(true, [{ readyState: 'live', muted: false }]))).toBe(true);
  });

  it('rejects a stream whose only video track has ended', () => {
    expect(isStreamLive(makeStream(true, [{ readyState: 'ended', muted: false }]))).toBe(false);
  });

  it('rejects a stream whose only video track is muted, even while live', () => {
    // The frozen-tile case: a remote track that stopped receiving media keeps
    // readyState 'live' and only flips its muted flag.
    expect(isStreamLive(makeStream(true, [{ readyState: 'live', muted: true }]))).toBe(false);
  });

  it('rejects an inactive stream regardless of its tracks', () => {
    expect(isStreamLive(makeStream(false, [{ readyState: 'live', muted: false }]))).toBe(false);
  });

  it('rejects a stream with no video tracks at all', () => {
    expect(isStreamLive(makeStream(true, []))).toBe(false);
  });

  it('accepts a stream where at least one of several tracks still delivers', () => {
    expect(isStreamLive(makeStream(true, [
      { readyState: 'ended', muted: false },
      { readyState: 'live', muted: false },
    ]))).toBe(true);
  });
});

describe('availableAvatarSlots', () => {
  it('leaves the whole grid to avatars when nothing else occupies a cell', () => {
    expect(availableAvatarSlots(0)).toBe(MAX_TILES);
  });

  // Regression: the cap used to be measured against the webcam count alone, so
  // the presentation/screenshare tile did not consume a slot. With 1
  // presentation + 3 webcams the grid closed at 1 + 3 + 7 = 11 cells, one over
  // the promised ceiling of 10.
  it('counts the presentation tile as an occupied cell', () => {
    const presentationPlusThreeWebcams = 4;
    expect(availableAvatarSlots(presentationPlusThreeWebcams)).toBe(6);
    expect(presentationPlusThreeWebcams + availableAvatarSlots(presentationPlusThreeWebcams))
      .toBe(MAX_TILES);
  });

  it('never lets the combined grid exceed MAX_TILES', () => {
    range(0, MAX_TILES + 5).forEach((occupied) => {
      expect(occupied + availableAvatarSlots(occupied)).toBeLessThanOrEqual(
        Math.max(occupied, MAX_TILES),
      );
    });
  });

  it('returns zero once the occupied cells already fill or overflow the grid', () => {
    expect(availableAvatarSlots(MAX_TILES)).toBe(0);
    expect(availableAvatarSlots(MAX_TILES + 3)).toBe(0);
  });

  it('honours an explicit ceiling over the default', () => {
    expect(availableAvatarSlots(2, 6)).toBe(4);
  });
});
