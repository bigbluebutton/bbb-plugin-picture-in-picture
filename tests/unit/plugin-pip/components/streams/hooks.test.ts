import {
  describe, it, expect, vi,
} from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('bigbluebutton-html-plugin-sdk', () => ({
  LayoutPresentationAreaUiDataNames: { CURRENT_ELEMENT: 'CURRENT_ELEMENT' },
  PresentationWhiteboardUiDataNames: { CURRENT_PAGE_SNAPSHOT: 'CURRENT_PAGE_SNAPSHOT' },
  UiLayouts: { WHITEBOARD: 'WHITEBOARD' },
}));

// eslint-disable-next-line import/first
import {
  usePresentationAreaOpen,
  usePresentationSnapshot,
} from '../../../../../src/plugin-pip/components/streams/hooks';

// The hook effect depends on the pluginApi identity, so tests must keep a stable
// reference across re-renders (a fresh object per render would re-run the effect).
const makeApi = (getUiData?: unknown) => ({ getUiData } as never);

describe('usePresentationAreaOpen', () => {
  it('returns whether the whiteboard presentation area is open', () => {
    const useUiData = vi.fn().mockReturnValue([
      { currentElement: 'WHITEBOARD', isOpen: false },
    ]);

    const { result } = renderHook(() => usePresentationAreaOpen({ useUiData } as never));

    expect(result.current).toBe(false);
    expect(useUiData).toHaveBeenCalledWith(
      'CURRENT_ELEMENT',
      [{ currentElement: 'WHITEBOARD', isOpen: true }],
    );
  });

  it('defaults to open when the client has not answered', () => {
    const useUiData = vi.fn((_, defaultValue) => defaultValue);

    const { result } = renderHook(() => usePresentationAreaOpen({ useUiData } as never));

    expect(result.current).toBe(true);
  });
});

describe('usePresentationSnapshot', () => {
  it('stays idle and does not fetch when disabled', () => {
    const getUiData = vi.fn();
    const api = makeApi(getUiData);
    const { result } = renderHook(() => usePresentationSnapshot(api, false));

    expect(result.current.image).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getUiData).not.toHaveBeenCalled();
  });

  it('loads the current slide snapshot when enabled', async () => {
    const getUiData = vi.fn().mockResolvedValue({ base64Png: 'data:image/png;base64,AAAA' });
    const api = makeApi(getUiData);
    const { result } = renderHook(() => usePresentationSnapshot(api, true));

    await waitFor(() => expect(result.current.image).toBe('data:image/png;base64,AAAA'));
    expect(result.current.isLoading).toBe(false);
    expect(getUiData).toHaveBeenCalledWith('CURRENT_PAGE_SNAPSHOT');
  });

  it('clears loading and keeps a null image when the snapshot fetch rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getUiData = vi.fn().mockRejectedValue(new Error('no snapshot'));
    const api = makeApi(getUiData);
    const { result } = renderHook(() => usePresentationSnapshot(api, true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.image).toBeNull();
    warnSpy.mockRestore();
  });

  it('stops loading when the plugin api exposes no getUiData', () => {
    const api = makeApi(undefined);
    const { result } = renderHook(() => usePresentationSnapshot(api, true));
    expect(result.current.isLoading).toBe(false);
  });

  it('refetches the snapshot on the 5s interval', async () => {
    vi.useFakeTimers();
    try {
      const getUiData = vi.fn().mockResolvedValue({ base64Png: 'x' });
      const api = makeApi(getUiData);
      renderHook(() => usePresentationSnapshot(api, true));

      await vi.advanceTimersByTimeAsync(0);
      expect(getUiData).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(getUiData).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the image when it becomes disabled', async () => {
    const getUiData = vi.fn().mockResolvedValue({ base64Png: 'x' });
    const api = makeApi(getUiData);
    const { result, rerender } = renderHook(
      ({ enabled }) => usePresentationSnapshot(api, enabled),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.image).toBe('x'));

    rerender({ enabled: false });
    expect(result.current.image).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('stops loading when disabled after a snapshot request never settles', () => {
    const getUiData = vi.fn().mockReturnValue(new Promise(() => {}));
    const api = makeApi(getUiData);
    const { result, rerender } = renderHook(
      ({ enabled }) => usePresentationSnapshot(api, enabled),
      { initialProps: { enabled: true } },
    );

    expect(result.current.isLoading).toBe(true);
    rerender({ enabled: false });
    expect(result.current.image).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
