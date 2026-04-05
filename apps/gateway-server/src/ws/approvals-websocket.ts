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

const WS_APPROVALS_PATH = "/v1/approvals/ws";

export interface ApprovalsWebSocketOptions {
  /** Optional API key; when set, clients must provide x-api-key or ?apiKey=. */
  readonly apiKey?: string;
}

function isAuthorized(req: IncomingMessage, expectedApiKey?: string): boolean {
  if (!expectedApiKey) return true;
  const headerKey = req.headers["x-api-key"];
  const providedHeader = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  if (providedHeader === expectedApiKey) return true;

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

    if (!isAuthorized(req, options?.apiKey)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    // Initial snapshot so clients immediately render current queue state.
    safeSend(ws, {
      type: "snapshot",
      pending: ctx.approvalQueue.getPending(),
      timestamp: new Date().toISOString(),
    });

    const unsubscribe = ctx.approvalQueue.on((event) => {
      safeSend(ws, event);
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      safeSend(ws, { type: "heartbeat", ts: new Date().toISOString() });
    }, 30_000);

    ws.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
