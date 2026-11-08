import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paginated } from '../api/types';
import { isAbortError } from '../api/errors';

export interface PaginatedList<T> {
  items: T[];
  count: number;
  /** True during the first page load (or a reload after filters change). */
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  setItems: (updater: (prev: T[]) => T[]) => void;
  setCount: (updater: (prev: number) => number) => void;
}

/**
 * Page-number pagination with "Load more". `key` should change whenever the
 * filters change; that resets to page 1 and discards stale responses.
 */
export function usePaginatedList<T>(
  fetchPage: (page: number, signal: AbortSignal) => Promise<Paginated<T>>,
  key: string,
): PaginatedList<T> {
  const [items, setItemsState] = useState<T[]>([]);
  const [count, setCountState] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const generation = useRef(0);

  // Page number is tied to the current filters: a new key (or reload) means page 1.
  const resetKey = `${key}|${tick}`;
  const [pageState, setPageState] = useState({ resetKey, page: 1 });
  const page = pageState.resetKey === resetKey ? pageState.page : 1;

  useEffect(() => {
    const gen = ++generation.current;
    const controller = new AbortController();
    const first = page === 1;
    if (first) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    fetchRef
      .current(page, controller.signal)
      .then((res) => {
        if (gen !== generation.current) return;
        setItemsState((prev) => (first ? res.results : [...prev, ...res.results]));
        setCountState(res.count);
        setHasMore(Boolean(res.next));
      })
      .catch((err: unknown) => {
        if (gen === generation.current && !isAbortError(err)) setError(err);
      })
      .finally(() => {
        if (gen === generation.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      });
    return () => controller.abort();
  }, [page, resetKey]);

  const loadMore = useCallback(
    () => setPageState((s) => ({ resetKey, page: (s.resetKey === resetKey ? s.page : 1) + 1 })),
    [resetKey],
  );
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setItems = useCallback((u: (prev: T[]) => T[]) => setItemsState(u), []);
  const setCount = useCallback((u: (prev: number) => number) => setCountState(u), []);

  return { items, count, loading, loadingMore, error, hasMore, loadMore, reload, setItems, setCount };
}
