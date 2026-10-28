import { useCallback, useEffect, useState } from 'react';
import { ApiError, toApiError } from '../services/http';

interface QueryState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

/**
 * Loads data from the API whenever `fetcher` changes and exposes `reload` for
 * refreshing after mutations. Responses from superseded requests are ignored.
 * Wrap `fetcher` in useCallback so it only changes when its inputs change.
 */
export function useApiQuery<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<QueryState<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetcher().then(
      (data) => {
        if (active) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (active) setState((previous) => ({ ...previous, error: toApiError(error), loading: false }));
      },
    );
    return () => {
      active = false;
    };
  }, [fetcher, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { ...state, reload };
}
