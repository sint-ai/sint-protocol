/**
 * SINT Gateway Server — Approval WebSocket transport.
 *
 * Provides low-latency approval queue updates as an alternative transport
 * to the existing SSE endpoint at /v1/approvals/events.
 *
 * @module @sint/gateway-server/ws/approvals-websocket
 */

import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ServerContext } from "../server.js";
import { globalApprovalBus } from "./ws-approval-stream.js";

const WS_APPROVALS_PATH = "/v1/approvals/ws";

export interface ApprovalsWebSocketOptions {
  /** Optional API key; when set, clients must provide x-api-key (or query key if allowed). */
  readonly apiKey?: string;
  /** Allow API key via querystring (?apiKey=...) for browser-only clients. Default false. */
  readonly allowQueryApiKey?: boolean;
}

function isAuthorized(
  req: IncomingMessage,
  expectedApiKey?: string,
  allowQueryApiKey = false,
): boolean {
  if (!expectedApiKey) return true;
  const headerKey = req.headers["x-api-key"];
  const providedHeader = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  if (providedHeader === expectedApiKey) return true;
  if (!allowQueryApiKey) return false;

  const url = new URL(req.url ?? "/", "http://localhost");
  const queryKey = url.searchParams.get("apiKey");
  return queryKey === expectedApiKey;
}

function safeSend(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

/**
 * Attach the approval WebSocket endpoint to an existing HTTP server.
 * Path: /v1/approvals/ws
 */
export function attachApprovalsWebSocket(
  server: HttpServer,
  ctx: ServerContext,
  options?: ApprovalsWebSocketOptions,
): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== WS_APPROVALS_PATH) return;

    if (!isAuthorized(req, options?.apiKey, options?.allowQueryApiKey)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Parse replay cursor from request URL (available via upgrade request below)
    const replayAfter = Number.parseInt(url.searchParams.get("cursor") ?? "", 10);
    const replaySince = url.searchParams.get("since");
    const replayLimitRaw = Number.parseInt(url.searchParams.get("replayLimit") ?? "200", 10);
    const replayLimit = Number.isFinite(replayLimitRaw)
      ? Math.max(1, Math.min(replayLimitRaw, 500))
      : 200;

    // Initial snapshot so clients immediately render current queue state.
    safeSend(ws, {
      type: "snapshot",
      pending: ctx.approvalQueue.getPending(),
      timestamp: new Date().toISOString(),
    });

    // Optional replay support for reconnect recovery.
    const replayEvents = Number.isFinite(replayAfter)
      ? globalApprovalBus.replayAfter(replayAfter, replayLimit)
      : replaySince
        ? globalApprovalBus.replayAfterTimestamp(replaySince, replayLimit)
        : [];
    if (replayEvents.length > 0) {
      safeSend(ws, {
        type: "replay.start",
        count: replayEvents.length,
        oldestSequence: replayEvents[0]?.sequence ?? null,
        newestSequence: replayEvents[replayEvents.length - 1]?.sequence ?? null,
      });
      for (const replayEvent of replayEvents) {
        safeSend(ws, {
          ...replayEvent,
          replay: true,
        });
      }
      safeSend(ws, { type: "replay.complete", count: replayEvents.length });
    }

    const unsubscribe = ctx.approvalQueue.on((event) => {
      safeSend(ws, event);
    });

    // Also forward typed APPROVAL_REQUIRED and DECISION events from the bus.
    const unsubscribeStream = globalApprovalBus.on((event) => {
      safeSend(ws, event);
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      safeSend(ws, { type: "heartbeat", ts: new Date().toISOString() });
    }, 30_000);

    ws.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeStream();
    });
  });
}
