/**
 * SINT Gateway Server — A2A (Agent-to-Agent) routes.
 *
 * Exposes a JSON-RPC 2.0 endpoint that intercepts Google A2A protocol
 * task messages before forwarding them to target agents.
 *
 * Endpoints:
 *   POST /v1/a2a                 — JSON-RPC 2.0 dispatcher (all A2A methods)
 *   GET  /v1/a2a/agents          — List registered Agent Cards
 *   POST /v1/a2a/agents          — Register an Agent Card
 *   GET  /v1/a2a/agents/:url     — Retrieve a specific Agent Card
 *
 * @module @sint/gateway-server/routes/a2a
 */

import { Hono } from "hono";
import {
  A2AInterceptor,
  AgentCardRegistry,
  buildDenyResponse,
  buildEscalationResponse,
  type A2AAgentCard,
  type A2AInterceptorConfig,
  type A2AJsonRpcRequest,
  type A2ASendTaskParams,
  A2A_ERROR_CODES,
} from "@pshkv/bridge-a2a";
import type { ServerContext } from "../server.js";

/** Context required for the A2A route. */
export interface A2ARouteContext {
  readonly serverContext: ServerContext;
  readonly registry: AgentCardRegistry;
  /**
   * Token resolver: given an agentId, returns the tokenId to use for
   * PolicyGateway interception.  The caller controls which token is used
   * for A2A delegation.
   */
  readonly resolveToken?: (agentId: string) => string | undefined;
  readonly defaultInterceptorConfig?: Partial<A2AInterceptorConfig>;
}

/**
 * Build the A2A route Hono app.
 */
export function a2aRoutes(ctx: A2ARouteContext): Hono {
  const app = new Hono();

  // ── JSON-RPC 2.0 dispatcher ──────────────────────────────────────────────

  /**
   * POST /v1/a2a
   *
   * Accepts A2A JSON-RPC 2.0 requests. Intercepts supported methods through
   * the SINT PolicyGateway before returning a result or forwarding.
   */
  app.post("/v1/a2a", async (c) => {
    let rpcRequest: A2AJsonRpcRequest;
    try {
      rpcRequest = await c.req.json<A2AJsonRpcRequest>();
    } catch {
      return c.json({
        jsonrpc: "2.0",
        id: null,
        error: { code: A2A_ERROR_CODES.PARSE_ERROR, message: "Parse error" },
      }, 400);
    }

    if (!rpcRequest.method || !rpcRequest.params) {
      return c.json({
        jsonrpc: "2.0",
        id: rpcRequest.id ?? null,
        error: { code: A2A_ERROR_CODES.INVALID_REQUEST, message: "Invalid Request" },
      }, 400);
    }

    const { id, method, params } = rpcRequest;

    // Extract agent identity from headers (passed by the calling agent)
    const agentId = c.req.header("X-SINT-Agent-Id");
    const tokenId = agentId ? ctx.resolveToken?.(agentId) : undefined;

    // Identify the target agent from the request metadata
    const p = params as Record<string, unknown>;
    const targetAgentUrl = (p["targetAgentUrl"] as string | undefined)
      ?? (p["metadata"] as Record<string, unknown> | undefined)?.["targetAgentUrl"] as string | undefined;

    if (!targetAgentUrl) {
      return c.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: A2A_ERROR_CODES.INVALID_PARAMS,
          message: "Missing params.targetAgentUrl — SINT requires the target agent URL for policy evaluation",
        },
      }, 400);
    }

    const card = ctx.registry.get(targetAgentUrl);
    if (!card) {
      return c.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: A2A_ERROR_CODES.TASK_NOT_FOUND,
          message: `Target agent not registered: ${targetAgentUrl}. Register it first via POST /v1/a2a/agents`,
        },
      }, 404);
    }

    if (!agentId || !tokenId) {
      return c.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: A2A_ERROR_CODES.SINT_POLICY_DENY,
          message: "Missing X-SINT-Agent-Id header or no token registered for this agent",
        },
      }, 401);
    }

    const interceptor = new A2AInterceptor(
      ctx.serverContext.gateway,
      agentId,
      tokenId,
      { agentCard: card, ...ctx.defaultInterceptorConfig },
    );

    const taskParams = params as A2ASendTaskParams;
    let result;

    switch (method) {
      case "tasks/send":
        result = await interceptor.interceptSend(taskParams);
        break;
      case "tasks/sendSubscribe":
        result = await interceptor.interceptStream(taskParams);
        break;
      case "tasks/cancel":
        result = await interceptor.interceptCancel(taskParams.id ?? String(p["id"]));
        break;
      default:
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: A2A_ERROR_CODES.METHOD_NOT_FOUND, message: `Method not found: ${method}` },
        }, 200);
    }

    if (result.action === "deny") {
      return c.json(buildDenyResponse(id, result.reason), 200);
    }
    if (result.action === "escalate") {
      return c.json(buildEscalationResponse(id, result.reason), 200);
    }

    // action === "forward" — return the task for the caller to forward
    return c.json({
      jsonrpc: "2.0",
      id,
      result: { task: result.task, sint: { approved: true } },
    });
  });

  // ── Agent Card registry endpoints ─────────────────────────────────────────

  /** GET /v1/a2a/agents — list all registered agents */
  app.get("/v1/a2a/agents", (c) => {
    return c.json({
      agents: ctx.registry.list().map((url) => ctx.registry.get(url)),
      total: ctx.registry.size,
    });
  });

  /** POST /v1/a2a/agents — register an Agent Card */
  app.post("/v1/a2a/agents", async (c) => {
    let card: A2AAgentCard;
    try {
      card = await c.req.json<A2AAgentCard>();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (!card.url || !card.name || !Array.isArray(card.skills)) {
      return c.json({ error: "Agent Card missing required fields: url, name, skills" }, 400);
    }

    ctx.registry.register(card);
    return c.json({ registered: true, url: card.url }, 201);
  });

  /** GET /v1/a2a/agents/:url — retrieve a specific Agent Card */
  app.get("/v1/a2a/agents/:url", (c) => {
    const encodedUrl = c.req.param("url");
    const url = decodeURIComponent(encodedUrl);
    const card = ctx.registry.get(url);
    if (!card) return c.json({ error: "Agent not found" }, 404);
    return c.json(card);
  });

  return app;
}
