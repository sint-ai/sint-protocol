/**
 * SINT Dashboard — Real-time Approval SSE Hook.
 *
 * Connects to /v1/approvals/events via Server-Sent Events
 * and keeps an in-memory list of pending approvals.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { ApprovalRequest, ApprovalSSEEvent } from "../api/types.js";
import { getPendingApprovals } from "../api/client.js";

export interface UseApprovalsResult {
  /** Current pending approval requests. */
  pending: ApprovalRequest[];
  /** Whether the SSE connection is active. */
  connected: boolean;
  /** Last SSE error, if any. */
  error: string | null;
  /** Force-refresh from REST API. */
  refresh: () => Promise<void>;
}

export function useApprovals(): UseApprovalsResult {
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getPendingApprovals();
      setPending(data.requests);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch approvals");
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    void refresh();

    // Connect SSE
    const es = new EventSource("/v1/approvals/events");
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ApprovalSSEEvent;

        if (data.type === "queued" && data.request) {
          setPending((prev) => {
            // Avoid duplicates
            if (prev.some((r) => r.requestId === data.request!.requestId)) {
              return prev;
            }
            return [...prev, data.request!];
          });
        } else if (data.type === "resolved" || data.type === "timeout") {
          setPending((prev) => prev.filter((r) => r.requestId !== data.requestId));
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError("SSE connection lost. Reconnecting...");
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [refresh]);

  return { pending, connected, error, refresh };
}
