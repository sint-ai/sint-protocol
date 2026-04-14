/**
 * SINT Gateway Server — Real-time Risk Score SSE stream.
 *
 * GET /v1/risk/stream
 *
 * Server-Sent Events stream of real-time risk scores.
 * Emits a RiskUpdate event after every PolicyGateway decision.
 *
 * Risk score formula:
 *   riskScore = (tierIndex/3) * 0.5 + (csml ?? 0) * 0.5
 *
 * where tierIndex: T0_observe=0, T1_prepare=1, T2_act=2, T3_commit=3
 *
 * Event format (data line):
 *   {"agentId":"...","resource":"...","tier":"T2_act","riskScore":0.72,"csml":0.85,"timestamp":"..."}
 *
 * @module @sint/gateway-server/routes/risk-stream
 */

import { Hono } from "hono";
import { ApprovalTier } from "@pshkv/core";
import type { ServerContext } from "../server.js";

/** A single risk score update emitted over the SSE stream. */
export interface RiskUpdate {
  readonly agentId: string;
  readonly resource: string;
  readonly tier: string;
  readonly riskScore: number;
  readonly csml: number | null;
  readonly timestamp: string;
}

/** Map from ApprovalTier (and RiskTier) string values to numeric index 0–3. */
const TIER_INDEX: Record<string, number> = {
  [ApprovalTier.T0_OBSERVE]: 0,
  "T0_read": 0,
  [ApprovalTier.T1_PREPARE]: 1,
  "T1_write_low": 1,
  [ApprovalTier.T2_ACT]: 2,
  "T2_stateful": 2,
  [ApprovalTier.T3_COMMIT]: 3,
  "T3_irreversible": 3,
};

/**
 * Compute a normalised risk score from tier + CSML.
 *
 * riskScore = (tierIndex/3) * 0.5 + (csml ?? 0) * 0.5
 *
 * Range: [0, 1]
 *  - Pure T0 with zero CSML → 0.0
 *  - Pure T3 with CSML=1.0 → 1.0
 */
export function computeRiskScore(tier: string, csml: number | null): number {
  const tierIndex = TIER_INDEX[tier] ?? 0;
  const csmlValue = csml ?? 0;
  return (tierIndex / 3) * 0.5 + csmlValue * 0.5;
}

/**
 * In-process event bus for risk score updates.
 * Shared between the intercept route (publisher) and risk-stream route (subscribers).
 */
export class RiskScoreBus {
  private readonly listeners: Set<(update: RiskUpdate) => void> = new Set();

  /** Subscribe to risk score updates. Returns an unsubscribe function. */
  on(listener: (update: RiskUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Emit a risk score update to all subscribers. */
  emit(update: RiskUpdate): void {
    for (const listener of this.listeners) {
      try {
        listener(update);
      } catch {
        // Never let a listener crash the publisher
      }
    }
  }
}

/** Singleton risk score bus — injected into ServerContext if provided. */
export const globalRiskBus = new RiskScoreBus();

export function riskStreamRoutes(ctx: ServerContext, riskBus: RiskScoreBus = globalRiskBus): Hono {
  const app = new Hono();

  /**
   * GET /v1/risk/stream
   *
   * Server-Sent Events stream of real-time risk scores.
   * Each event is emitted after a PolicyGateway decision.
   *
   * Clients connect and receive:
   *   data: {"agentId":"...","resource":"...","tier":"T2_act","riskScore":0.72,"csml":0.85,"timestamp":"..."}
   *
   * Heartbeat comments (": heartbeat") are sent every 30s to keep the
   * connection alive through proxies and load balancers.
   */
  app.get("/v1/risk/stream", (c) => {
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

        // Subscribe to future risk score events
        const unsubscribe = riskBus.on((update) => {
          send(JSON.stringify(update));
        });

        // Emit a synthetic initial event summarising ledger size so the
        // client knows the stream is live (optional, non-blocking)
        const allEvents = ctx.ledger.getAll();
        const riskEvents = allEvents.filter(
          (e) => e.eventType === "risk.score.computed",
        );
        if (riskEvents.length > 0) {
          const latest = riskEvents[riskEvents.length - 1]!;
          send(JSON.stringify({ type: "snapshot", eventCount: riskEvents.length, latest: latest.payload }));
        }

        // Clean up when client disconnects
        c.req.raw.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Already closed
          }
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

  return app;
}
