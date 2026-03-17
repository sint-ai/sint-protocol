/**
 * SINT Dashboard — Polling Hook.
 *
 * Periodically fetches data from an async function.
 * Used for non-SSE endpoints (ledger, health, etc.)
 */

import { useEffect, useState, useCallback, useRef } from "react";

export interface UsePollingResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = 5000,
): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { data, loading, error, refresh };
}
