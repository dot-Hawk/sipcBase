import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters, search and page of a catalogue list live in the URL, so reload, back and shared links
 * keep the view. Empty values are removed; any change but `page` goes back to page 1.
 */
export function useListParams(keys: readonly string[]) {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const set = useCallback(
    (patch: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === '') next.delete(k);
            else next.set(k, v);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const clear = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  const active = keys.some((k) => params.get(k));
  return { get, page, set, clear, active };
}
