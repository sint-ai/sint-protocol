// NOTE: This hook is kept for Console integration reference.
// The HUD voice layer does not consume approval streams directly.
// The SINT Console Conductor module handles approval UI.

/**
 * SINT Dashboard — WebSocket Approval Stream Hook.
 *
 * Connects to the gateway's WebSocket endpoint (/v1/approvals/ws) and
 * delivers a live feed of T2/T3 APPROVAL_REQUIRED and DECISION events.
 *
 * Features:
 * - Automatic exponential-backoff reconnection on disconnect
 * - Filters to only APPROVAL_REQUIRED and DECISION typed events
 * - Caps the event list at MAX_EVENTS (50) — oldest entries are dropped
 * - Exposes connection state for UI indicators
 */

import { useEffect, useRef, useState } from "react";
import type { ApprovalStreamEvent } from "../api/types.js";

export interface UseApprovalStreamResult {
  /** Received APPROVAL_REQUIRED and DECISION events (newest last, capped at 50). */
  events: ApprovalStreamEvent[];
  /** Whether the WebSocket connection is currently open. */
  connected: boolean;
}

const MAX_EVENTS = 50;

/**
 * React hook for consuming the WebSocket approval stream.
 *
 * @param gatewayUrl  Base URL of the gateway server, e.g. "http://localhost:3000".
 *                    Falls back to the Vite env var VITE_GATEWAY_URL if empty.
 * @param apiKey      Optional API key sent as a query parameter.
 */
export function useApprovalStream(
  gatewayUrl?: string,
  apiKey?: string,
): UseApprovalStreamResult {
  const [events, setEvents] = useState<ApprovalStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    const base = gatewayUrl ?? (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? "";
    // Convert http(s):// to ws(s)://; leave ws(s):// untouched
    const wsBase = base.replace(/^http(s?):\/\//i, (_, s: string) => `ws${s}://`);
    const wsPath = "/v1/approvals/ws";

    function buildUrl(): string {
      const url = `${wsBase}${wsPath}`;
      if (apiKey) {
        return `${url}?apiKey=${encodeURIComponent(apiKey)}`;
      }
      return url;
    }

    function connect(): void {
      if (unmountedRef.current) return;

      const ws = new WebSocket(buildUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return; }
        retryCountRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (ev: MessageEvent<string>) => {
        if (unmountedRef.current) return;
        try {
          const data = JSON.parse(ev.data) as { type?: string };
          // Only surface the two typed approval stream events
          if (data.type === "APPROVAL_REQUIRED" || data.type === "DECISION") {
            const event = data as ApprovalStreamEvent;
            setEvents((prev) => {
              const next = [...prev, event];
              return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
            });
          }
        } catch {
          // Ignore malformed frames (e.g. heartbeats, snapshot)
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        wsRef.current = null;

        // Exponential backoff: 1s → 2s → 4s → … max 30s
        const delay = Math.min(1_000 * Math.pow(2, retryCountRef.current), 30_000);
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose fires right after onerror; reconnect logic lives there
        ws.close();
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [gatewayUrl, apiKey]);

  return { events, connected };
}
