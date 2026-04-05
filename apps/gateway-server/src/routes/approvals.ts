/**
 * SINT Gateway Server — Approval routes.
 *
 * REST endpoints for managing the human approval queue.
 * Real-time transports:
 * - SSE: /v1/approvals/events (implemented here)
 * - WebSocket: /v1/approvals/ws (attached at HTTP server level)
 */

import { Hono } from "hono";
import type { ServerContext } from "../server.js";

export function approvalRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  // SSE endpoint for real-time approval events
  // MUST be registered before /v1/approvals/:requestId to avoid
  // "events" being captured as a requestId parameter.
  app.get("/v1/approvals/events", (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;

        const send = (data: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            closed = true;
          }
        };

        // Heartbeat every 30s — keeps connection alive through proxies/firewalls
        const heartbeat = setInterval(() => {
          if (closed) {
            clearInterval(heartbeat);
            return;
          }
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            closed = true;
            clearInterval(heartbeat);
          }
        }, 30_000);

        // Send initial pending state
        const pending = ctx.approvalQueue.getPending();
        for (const req of pending) {
          send(JSON.stringify({ type: "queued", request: req }));
        }

        // Subscribe to future events
        const unsubscribe = ctx.approvalQueue.on((event) => {
          send(JSON.stringify(event));
        });

        // Clean up when client disconnects
        c.req.raw.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  // List all pending approval requests
  app.get("/v1/approvals/pending", (c) => {
    const pending = ctx.approvalQueue.getPending();
    return c.json({
      count: pending.length,
      requests: pending.map((r) => ({
        requestId: r.requestId,
        reason: r.reason,
        requiredTier: r.decision.assignedTier,
        resource: r.request.resource,
        action: r.request.action,
        agentId: r.request.agentId,
        fallbackAction: r.fallbackAction,
        approvalQuorum: r.quorum,
        approvalCount: ctx.approvalQueue.getApprovalCount(r.requestId),
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      })),
    });
  });

  // Get a specific pending approval request
  app.get("/v1/approvals/:requestId", (c) => {
    const requestId = c.req.param("requestId");
    const request = ctx.approvalQueue.get(requestId);

    if (!request) {
      return c.json({ error: "Approval request not found" }, 404);
    }

    return c.json({
      requestId: request.requestId,
      reason: request.reason,
      requiredTier: request.decision.assignedTier,
      resource: request.request.resource,
      action: request.request.action,
      agentId: request.request.agentId,
      params: request.request.params,
      physicalContext: request.request.physicalContext,
      executionContext: request.request.executionContext,
      fallbackAction: request.fallbackAction,
      approvalQuorum: request.quorum,
      approvalCount: ctx.approvalQueue.getApprovalCount(request.requestId),
      timeoutMs: request.timeoutMs,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    });
  });

  // Resolve (approve or deny) a pending approval request
  app.post("/v1/approvals/:requestId/resolve", async (c) => {
    const requestId = c.req.param("requestId");
    const body = await c.req.json();

    if (!body.status || !["approved", "denied"].includes(body.status)) {
      return c.json(
        { error: "Missing or invalid 'status' field (must be 'approved' or 'denied')" },
        400,
      );
    }

    if (!body.by || typeof body.by !== "string") {
      return c.json({ error: "Missing 'by' field (reviewer identity)" }, 400);
    }

    const existing = ctx.approvalQueue.get(requestId);
    if (!existing) {
      return c.json({ error: "Approval request not found or already resolved" }, 404);
    }

    const resolution = ctx.approvalQueue.resolve(requestId, {
      status: body.status,
      by: body.by,
      reason: body.reason,
    });

    if (!resolution) {
      return c.json({
        requestId,
        status: "pending",
        requiredApprovals: existing.quorum?.required ?? 1,
        approvalCount: ctx.approvalQueue.getApprovalCount(requestId),
      }, 202);
    }

    ctx.ledger.append({
      eventType: resolution.status === "approved" ? "approval.granted" : "approval.denied",
      agentId: "system",
      payload: {
        requestId,
        resolution,
      },
    });

    return c.json({ requestId, resolution });
  });

  return app;
}
