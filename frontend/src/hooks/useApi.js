import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small data-fetching hook with loading/error state, manual reload and optional
 * polling. `deps` controls re-fetching; the fetcher itself is read through a ref so
 * inline arrow functions do not trigger an infinite loop.
 */
export function useApi(fetcher, deps = [], { pollMs = null, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled, updatedAt: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (mounted.current) {
        setState({ data, error: null, loading: false, updatedAt: new Date().toISOString() });
      }
      return data;
    } catch (error) {
      if (mounted.current) {
        setState((prev) => ({ data: prev.data, error: error.message, loading: false, updatedAt: prev.updatedAt }));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    run();
    if (!pollMs) return undefined;
    const timer = setInterval(() => run({ silent: true }), pollMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, pollMs]);

  return { ...state, reload: run };
}
