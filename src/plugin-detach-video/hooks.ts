import { useEffect, useRef } from 'react';

export function usePrevious<T = unknown>(value: T) {
  const previousValue = useRef<T | undefined>();

  useEffect(() => {
    previousValue.current = value;
  });

  return previousValue.current;
}
