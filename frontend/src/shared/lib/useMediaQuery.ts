import { useSyncExternalStore } from 'react';

/** Tracks a CSS media query. Without matchMedia (tests, old engines) it reports `fallback`. */
export function useMediaQuery(query: string, fallback = true): boolean {
  const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  return useSyncExternalStore(
    (cb) => {
      mql?.addEventListener('change', cb);
      return () => mql?.removeEventListener('change', cb);
    },
    () => (mql ? mql.matches : fallback),
    () => fallback,
  );
}
