/**
 * SINT Gateway Server — Intercept routes.
 */

import { Hono } from "hono";
import type { SintRequest } from "@pshkv/core";
import { sintRequestSchema, ApprovalTier } from "@pshkv/core";
import type { ServerContext } from "../server.js";
import { globalRiskBus, computeRiskScore } from "./risk-stream.js";
import { globalApprovalBus } from "../ws/ws-approval-stream.js";

/** Tiers that require real-time streaming events. */
const STREAMABLE_TIERS: ReadonlySet<string> = new Set([
  ApprovalTier.T2_ACT,
  ApprovalTier.T3_COMMIT,
]);

export function interceptRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  // Single request interception
  app.post("/v1/intercept", async (c) => {
    const body = await c.req.json();
    const parsed = sintRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", details: parsed.error.issues },
        400,
      );
    }

    const decision = await ctx.gateway.intercept(parsed.data as SintRequest);

    ctx.ledger.append({
      eventType: "request.received",
      agentId: parsed.data.agentId,
      tokenId: parsed.data.tokenId,
      payload: {
        resource: parsed.data.resource,
        action: parsed.data.action,
        decision: decision.action,
        executionContext: parsed.data.executionContext,
      },
    });

    // Emit real-time risk score to SSE subscribers
    const csml = (decision as any).csml ?? null;
    const riskScore = computeRiskScore(decision.assignedTier, csml);
    const riskUpdate = {
      agentId: parsed.data.agentId,
      resource: parsed.data.resource,
      tier: decision.assignedTier,
      riskScore,
      csml,
      timestamp: new Date().toISOString(),
    };
    ctx.ledger.append({
      eventType: "risk.score.computed",
      agentId: parsed.data.agentId,
      tokenId: parsed.data.tokenId,
      payload: riskUpdate,
    });
    globalRiskBus.emit(riskUpdate);

    const now = new Date().toISOString();

    // Stream T2/T3 DECISION events to WebSocket clients
    if (STREAMABLE_TIERS.has(decision.assignedTier)) {
      globalApprovalBus.emit({
        type: "DECISION",
        requestId: parsed.data.requestId,
        agentId: parsed.data.agentId,
        resource: parsed.data.resource,
        action: parsed.data.action,
        tier: decision.assignedTier,
        decision: decision.action,
        timestamp: now,
      });
    }

    // If escalated, enqueue for human approval and also emit APPROVAL_REQUIRED
    if (decision.action === "escalate") {
      const quorum = decision.escalation?.approvalQuorum;
      const approvalRequest = ctx.approvalQueue.enqueue(
        parsed.data as SintRequest,
        decision,
        quorum,
      );
      globalApprovalBus.emit({
        type: "APPROVAL_REQUIRED",
        requestId: approvalRequest.requestId,
        agentId: parsed.data.agentId,
        resource: parsed.data.resource,
        action: parsed.data.action,
        tier: decision.assignedTier,
        timestamp: now,
      });
      return c.json({ ...decision, approvalRequestId: approvalRequest.requestId });
    }

    return c.json(decision);
  });

  // Batch interception — 207 Multi-Status
  app.post("/v1/intercept/batch", async (c) => {
    const body = await c.req.json();

    if (!Array.isArray(body) || body.length === 0) {
      return c.json({ error: "Request body must be a non-empty array" }, 400);
    }

    if (body.length > 50) {
      return c.json({ error: "Maximum 50 requests per batch" }, 400);
    }

    const results = await Promise.all(body.map(async (item: unknown) => {
      const parsed = sintRequestSchema.safeParse(item);
      if (!parsed.success) {
        return {
          status: 400,
          error: "Invalid request",
          details: parsed.error.issues,
        };
      }

      const decision = await ctx.gateway.intercept(parsed.data as SintRequest);

      ctx.ledger.append({
        eventType: "request.received",
        agentId: parsed.data.agentId,
        tokenId: parsed.data.tokenId,
        payload: {
          resource: parsed.data.resource,
          action: parsed.data.action,
          decision: decision.action,
          executionContext: parsed.data.executionContext,
        },
      });

      const batchNow = new Date().toISOString();

      // Stream T2/T3 DECISION events to WebSocket clients
      if (STREAMABLE_TIERS.has(decision.assignedTier)) {
        globalApprovalBus.emit({
          type: "DECISION",
          requestId: parsed.data.requestId,
          agentId: parsed.data.agentId,
          resource: parsed.data.resource,
          action: parsed.data.action,
          tier: decision.assignedTier,
          decision: decision.action,
          timestamp: batchNow,
        });
      }

      if (decision.action === "escalate") {
        const quorum = decision.escalation?.approvalQuorum;
        const approvalRequest = ctx.approvalQueue.enqueue(
          parsed.data as SintRequest,
          decision,
          quorum,
        );
        globalApprovalBus.emit({
          type: "APPROVAL_REQUIRED",
          requestId: approvalRequest.requestId,
          agentId: parsed.data.agentId,
          resource: parsed.data.resource,
          action: parsed.data.action,
          tier: decision.assignedTier,
          timestamp: batchNow,
        });
        return { status: 202, decision, approvalRequestId: approvalRequest.requestId };
      }

      return { status: 200, decision };
    }));

    return c.json(results, 207);
  });

  return app;
}
