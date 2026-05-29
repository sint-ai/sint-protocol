import { useCallback, useEffect, useRef, useState } from "react";
import type { ApprovalRequest, ApprovalSSEEvent } from "../api/types.js";

export interface ApprovalResolutionInput {
  readonly status: "approved" | "denied";
  readonly by: string;
  readonly reason?: string;
}

export interface UseApprovalsResult {
  readonly pending: ApprovalRequest[];
  readonly connected: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly resolve: (
    requestId: string,
    resolution: ApprovalResolutionInput,
  ) => Promise<void>;
}

function gatewayPath(gatewayUrl: string, path: string): string {
  const base = gatewayUrl.replace(/\/$/, "");
  return `${base}${path}`;
}

async function requestJson<T>(
  gatewayUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(gatewayPath(gatewayUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export function useApprovals(gatewayUrl: string): UseApprovalsResult {
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await requestJson<{ requests: ApprovalRequest[] }>(
        gatewayUrl,
        "/v1/approvals/pending",
      );
      setPending(data.requests);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch approvals");
    }
  }, [gatewayUrl]);

  const resolve = useCallback(
    async (requestId: string, resolution: ApprovalResolutionInput) => {
      await requestJson(gatewayUrl, `/v1/approvals/${requestId}/resolve`, {
        method: "POST",
        body: JSON.stringify(resolution),
      });
      await refresh();
    },
    [gatewayUrl, refresh],
  );

  useEffect(() => {
    void refresh();

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const es = new EventSource(gatewayPath(gatewayUrl, "/v1/approvals/events"));
      eventSourceRef.current = es;

      es.onopen = () => {
        retryCount = 0;
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ApprovalSSEEvent;

          if (data.type === "queued" && data.request) {
            setPending((prev) => {
              if (prev.some((request) => request.requestId === data.request!.requestId)) {
                return prev;
              }
              return [...prev, data.request!];
            });
          } else if (data.type === "resolved" || data.type === "timeout") {
            setPending((prev) => prev.filter((request) => request.requestId !== data.requestId));
          }
        } catch {
          // Ignore comments, heartbeats, and malformed frames.
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        eventSourceRef.current = null;

        const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
        retryCount++;
        setError(`Approval stream reconnecting in ${Math.round(delay / 1000)}s`);
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [gatewayUrl, refresh]);

  return { pending, connected, error, refresh, resolve };
}
