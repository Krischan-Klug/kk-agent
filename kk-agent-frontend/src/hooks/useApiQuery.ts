import { useCallback, useEffect, useRef, useState } from "react";

interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

interface UseApiQueryResult<T> extends ApiState<T> {
  refetch: () => Promise<void>;
}

interface UseApiMutationResult<TInput, TOutput> {
  data: TOutput | undefined;
  loading: boolean;
  error: Error | undefined;
  execute: (input: TInput) => Promise<TOutput | undefined>;
  reset: () => void;
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

export function useApiMutation<TInput, TOutput>(
  mutator: (input: TInput) => Promise<TOutput>,
): UseApiMutationResult<TInput, TOutput> {
  const [state, setState] = useState<ApiState<TOutput>>({
    data: undefined,
    loading: false,
    error: undefined,
  });

  const mutatorRef = useRef(mutator);
  mutatorRef.current = mutator;

  const execute = useCallback(async (input: TInput) => {
    setState({ data: undefined, loading: true, error: undefined });
    try {
      const data = await mutatorRef.current(input);
      setState({ data, loading: false, error: undefined });
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ data: undefined, loading: false, error });
      return undefined;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: undefined, loading: false, error: undefined });
  }, []);

  return { ...state, execute, reset };
}
