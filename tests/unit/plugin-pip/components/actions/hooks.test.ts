import {
  describe, it, expect, vi,
} from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useCurrentUserVoice,
  useExitVideo,
  useToggleVoice,
} from '../../../../../src/plugin-pip/components/actions/hooks';

describe('useToggleVoice', () => {
  const makeApi = (userSetMuted: unknown) => ({
    useCustomMutation: vi.fn(() => [userSetMuted]),
  } as never);

  it('calls the mutation with the user id and muted flag', async () => {
    const userSetMuted = vi.fn();
    const { result } = renderHook(() => useToggleVoice(makeApi(userSetMuted)));

    await result.current('user-1', true);

    expect(userSetMuted).toHaveBeenCalledWith({ variables: { muted: true, userId: 'user-1' } });
  });

  it('does nothing when the mutation is not available', async () => {
    const { result } = renderHook(() => useToggleVoice(makeApi(undefined)));
    await expect(result.current('user-1', false)).resolves.toBeUndefined();
  });

  it('swallows errors thrown by the mutation', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const userSetMuted = vi.fn(() => { throw new Error('boom'); });
    const { result } = renderHook(() => useToggleVoice(makeApi(userSetMuted)));

    await expect(result.current('user-1', true)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('useCurrentUserVoice', () => {
  const makeApi = (data: unknown) => ({
    useCustomSubscription: vi.fn(() => ({ data })),
  } as never);

  it('returns undefined when there is no subscription data', () => {
    const { result } = renderHook(() => useCurrentUserVoice(makeApi(undefined)));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when user_current is absent', () => {
    const { result } = renderHook(() => useCurrentUserVoice(makeApi({})));
    expect(result.current).toBeUndefined();
  });

  it('returns the voice object of the current user', () => {
    const voice = {
      muted: false, talking: true, joined: true, listenOnly: false,
    };
    const api = makeApi({ user_current: [{ voice }] });
    const { result } = renderHook(() => useCurrentUserVoice(api));
    expect(result.current).toBe(voice);
  });
});

describe('useExitVideo', () => {
  const makeApi = (opts: {
    userId?: string;
    cameraBroadcastStop: unknown;
    userCamera: unknown[];
  }) => ({
    useCurrentUser: vi.fn(() => ({ data: { userId: opts.userId } })),
    useCustomMutation: vi.fn(() => [opts.cameraBroadcastStop]),
    useCustomSubscription: vi.fn(() => ({ data: { user_camera: opts.userCamera } })),
  } as never);

  it('stops only the current user own camera streams and resolves true', async () => {
    const cameraBroadcastStop = vi.fn().mockResolvedValue(undefined);
    const api = makeApi({
      userId: 'u1',
      cameraBroadcastStop,
      userCamera: [
        { streamId: 's1', user: { userId: 'u1' } },
        { streamId: 's2', user: { userId: 'u2' } },
        { streamId: 's3', user: { userId: 'u1' } },
      ],
    });

    const { result } = renderHook(() => useExitVideo(api));
    await expect(result.current()).resolves.toBe(true);

    expect(cameraBroadcastStop).toHaveBeenCalledTimes(2);
    expect(cameraBroadcastStop).toHaveBeenCalledWith({ variables: { cameraId: 's1' } });
    expect(cameraBroadcastStop).toHaveBeenCalledWith({ variables: { cameraId: 's3' } });
  });

  it('resolves true without stopping anything when the user has no streams', async () => {
    const cameraBroadcastStop = vi.fn().mockResolvedValue(undefined);
    const api = makeApi({
      userId: 'u1',
      cameraBroadcastStop,
      userCamera: [{ streamId: 's2', user: { userId: 'u2' } }],
    });

    const { result } = renderHook(() => useExitVideo(api));
    await expect(result.current()).resolves.toBe(true);
    expect(cameraBroadcastStop).not.toHaveBeenCalled();
  });

  it('resolves false when stopping a stream rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cameraBroadcastStop = vi.fn().mockRejectedValue(new Error('boom'));
    const api = makeApi({
      userId: 'u1',
      cameraBroadcastStop,
      userCamera: [{ streamId: 's1', user: { userId: 'u1' } }],
    });

    const { result } = renderHook(() => useExitVideo(api));
    await expect(result.current()).resolves.toBe(false);
    warnSpy.mockRestore();
  });
});
