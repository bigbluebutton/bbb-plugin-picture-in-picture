import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRerenderRef } from '../../../src/common/hooks';

describe('useRerenderRef', () => {
  it('exposes the initial value through the proxied ref', () => {
    const { result } = renderHook(() => useRerenderRef<string>('initial'));
    expect(result.current.current).toBe('initial');
  });

  it('reflects the latest value after setting .current', () => {
    const { result } = renderHook(() => useRerenderRef<string>(null));

    act(() => {
      result.current.current = 'updated';
    });

    expect(result.current.current).toBe('updated');
  });

  it('forces a re-render when .current changes', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useRerenderRef<number>(null);
    });

    const before = renders;
    act(() => {
      result.current.current = 42;
    });

    expect(renders).toBeGreaterThan(before);
    expect(result.current.current).toBe(42);
  });
});
