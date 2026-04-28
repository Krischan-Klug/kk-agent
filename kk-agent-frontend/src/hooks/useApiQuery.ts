import { useCallback, useEffect, useRef, useState } from "react";

interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

interface UseApiQueryResult<T> extends ApiState<T> {
  refetch: () => Promise<void>;
}

export function useApiQuery<T>(
  fetcher: () => Promise<T>,
): UseApiQueryResult<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: undefined,
    loading: true,
    error: undefined,
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const data = await fetcherRef.current();
      setState({ data, loading: false, error: undefined });
    } catch (err) {
      setState({
        data: undefined,
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}
