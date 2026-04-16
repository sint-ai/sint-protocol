/**
 * SINT MCP — Built-in SINT Tools.
 *
 * These tools are prefixed with "sint__" and provide SINT-specific
 * functionality directly as MCP tools: status, approval workflow,
 * audit trail, server management.
 *
 * @module @sint/mcp/tools/sint-tools
 */

import type { SintCapabilityToken } from "@pshkv/core";
import type { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import type { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { issueCapabilityToken, type RevocationStore } from "@pshkv/gate-capability-tokens";
import type { DownstreamManager } from "../downstream.js";

/** All built-in tool definitions for tools/list. */
export function getSintToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return [
    {
      name: "sint__status",
      description:
        "Inspect the current SINT runtime state before taking action. Use this to confirm the server is healthy, see how many downstream servers are connected, and check pending approvals. Returns a JSON status summary with server counts, aggregated tools, pending approvals, and ledger size.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "sint__servers",
      description:
        "List all configured downstream MCP servers and their live connection state. Use this when you need to know which servers are connected, how many tools they expose, or whether an upstream integration is unavailable. Returns a JSON array of server health summaries.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "sint__whoami",
      description:
        "Show the active SINT identity for the current session. Use this before issuing tokens, approving requests, or debugging delegation so you can confirm the acting public key and token context. Returns a JSON object with the current public key, token ID, and role.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "sint__pending",
      description:
        "List approval requests that are blocked waiting for review. Use this before calling sint__approve or sint__deny so you can inspect request IDs, affected resources, actions, reasons, and expiration times. This tool does not mutate state and returns a JSON array of pending approval summaries.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
        examples: [{}],
      },
    },
    {
      name: "sint__approve",
      description:
        "Approve one pending escalated action after human or operator review. Use this only with a requestId returned by sint__pending; approval releases the blocked action for execution and records the approver identity. Returns a confirmation message, or an error if the request does not exist.",
      inputSchema: {
        type: "object",
        properties: {
          requestId: {
            title: "Approval request ID",
            type: "string",
            description: "Approval request ID returned by sint__pending",
            minLength: 1,
            examples: ["apr_01hxyz..."],
          },
          by: {
            title: "Approver",
            type: "string",
            description: "Human or operator identifier recorded as the approver; defaults to the current agent identity",
            examples: ["alice@example.com", "ops-console"],
          },
        },
        required: ["requestId"],
        additionalProperties: false,
        examples: [{ requestId: "apr_01hxyz...", by: "ops-console" }],
      },
    },
    {
      name: "sint__deny",
      description:
        "Reject one pending escalated action so it cannot proceed. Use this after review when the request is unsafe, out of policy, or no longer needed; the denial reason is recorded in the audit trail. Returns a confirmation message, or an error if the request ID is unknown.",
      inputSchema: {
        type: "object",
        properties: {
          requestId: {
            title: "Approval request ID",
            type: "string",
            description: "Approval request ID returned by sint__pending",
            minLength: 1,
            examples: ["apr_01hxyz..."],
          },
          reason: {
            title: "Denial reason",
            type: "string",
            description: "Human-readable reason recorded in the audit trail and returned to the caller",
            examples: ["Outside approved maintenance window"],
          },
          by: {
            title: "Denying actor",
            type: "string",
            description: "Human or operator identifier recorded as the denying actor; defaults to the current agent identity",
            examples: ["alice@example.com", "ops-console"],
          },
        },
        required: ["requestId"],
        additionalProperties: false,
        examples: [{ requestId: "apr_01hxyz...", reason: "Outside approved maintenance window", by: "alice@example.com" }],
      },
    },
    {
      name: "sint__audit",
      description:
        "Read recent events from the SINT evidence ledger for debugging, compliance review, or operator context. Use this to inspect approvals, revocations, notifications, and other recorded actions without mutating state. Returns a JSON array of the newest ledger events, ordered from oldest to newest within the requested slice.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            title: "Event limit",
            type: "number",
            description: "Maximum number of newest ledger events to return; defaults to 20",
            minimum: 1,
            default: 20,
            examples: [10, 50],
          },
        },
        required: [],
        additionalProperties: false,
        examples: [{ limit: 10 }],
      },
    },
    {
      name: "sint__add_server",
      description:
        "Register and connect a new downstream MCP server while SINT is running. Use this to aggregate a new stdio server into the proxy without restarting the process; on success the server is immediately available through the aggregated tool namespace. Returns a confirmation message including the discovered tool count, or an error message if connection fails.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            title: "Server name",
            type: "string",
            description: "Unique short name used as the server prefix for aggregated tools",
            minLength: 1,
            examples: ["filesystem", "github"],
          },
          command: {
            title: "Startup command",
            type: "string",
            description: "Executable used to start the downstream stdio server",
            minLength: 1,
            examples: ["npx", "node"],
          },
          args: {
            title: "Command arguments",
            type: "array",
            items: { type: "string" },
            description: "Optional command arguments passed to the downstream server process",
            examples: [["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]],
          },
        },
        required: ["name", "command"],
        additionalProperties: false,
        examples: [{ name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }],
      },
    },
    {
      name: "sint__remove_server",
      description:
        "Disconnect and remove one downstream MCP server from the running proxy. Use this to disable an integration cleanly when it is unhealthy, no longer needed, or should stop exposing tools; after removal its aggregated tools disappear from the namespace. Returns a confirmation message after removal, or an error if the server name is unknown.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            title: "Server name",
            type: "string",
            description: "Server name as listed by sint__servers",
            minLength: 1,
            examples: ["filesystem", "github"],
          },
        },
        required: ["name"],
        additionalProperties: false,
        examples: [{ name: "filesystem" }],
      },
    },
    {
      name: "sint__issue_token",
      description:
        "Issue a new attenuated capability token for another subject. Use this for controlled delegation or integration setup when a new actor needs scoped access to a resource and action set; the new token is stored immediately and recorded in the ledger. Returns a JSON object with the new token ID, subject, resource, actions, and expiry.",
      inputSchema: {
        type: "object",
        properties: {
          subject: {
            title: "Token subject",
            type: "string",
            description: "Public key or subject identifier that will own the new token",
            minLength: 1,
            examples: ["ed25519:abc123...", "agent:planner-01"],
          },
          resource: {
            title: "Resource pattern",
            type: "string",
            description: "Resource URI pattern the token may access",
            minLength: 1,
            examples: ["mcp://filesystem/*", "mcp://github/repos/sint-ai/*"],
          },
          actions: {
            title: "Allowed actions",
            type: "array",
            items: { type: "string" },
            description: "Allowed actions for the token on that resource",
            minItems: 1,
            examples: [["call"], ["call", "exec.run"]],
          },
          expiresInHours: {
            title: "Lifetime in hours",
            type: "number",
            description: "Token lifetime in hours; defaults to 24",
            minimum: 1,
            default: 24,
            examples: [1, 24, 168],
          },
        },
        required: ["subject", "resource", "actions"],
        additionalProperties: false,
        examples: [{ subject: "agent:planner-01", resource: "mcp://github/repos/sint-ai/sint-protocol/*", actions: ["call"], expiresInHours: 24 }],
      },
    },
    {
      name: "sint__revoke_token",
      description:
        "Revoke an active capability token so it can no longer authorize actions. Use this when access should end immediately because of policy change, incident response, or delegation cleanup; the revocation is written to both the revocation store and the ledger. Returns a confirmation message.",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: {
            title: "Token ID",
            type: "string",
            description: "Token ID to revoke",
            minLength: 1,
            examples: ["tok_01hxyz..."],
          },
          reason: {
            title: "Revocation reason",
            type: "string",
            description: "Reason recorded in the revocation store and ledger",
            examples: ["Compromised credentials", "Delegation no longer needed"],
          },
        },
        required: ["tokenId"],
        additionalProperties: false,
        examples: [{ tokenId: "tok_01hxyz...", reason: "Delegation no longer needed" }],
      },
    },
  ];
}

/** Check if a tool name is a built-in SINT tool. */
export function isSintTool(name: string): boolean {
  return name.startsWith("sint__");
}

/** Context needed by SINT tool handlers. */
export interface SintToolContext {
  readonly downstream: DownstreamManager;
  readonly approvalQueue: ApprovalQueue;
  readonly ledger: LedgerWriter;
  readonly agentPublicKey: string;
  readonly agentPrivateKey: string;
  readonly tokenId: string;
  readonly tokenStore: Map<string, SintCapabilityToken>;
  readonly revocationStore: RevocationStore;
}

/**
 * Handle a built-in SINT tool call.
 */
export async function handleSintTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: SintToolContext,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case "sint__status":
      return handleStatus(ctx);
    case "sint__servers":
      return handleServers(ctx);
    case "sint__whoami":
      return handleWhoami(ctx);
    case "sint__pending":
      return handlePending(ctx);
    case "sint__approve":
      return handleApprove(args, ctx);
    case "sint__deny":
      return handleDeny(args, ctx);
    case "sint__audit":
      return handleAudit(args, ctx);
    case "sint__add_server":
      return handleAddServer(args, ctx);
    case "sint__remove_server":
      return handleRemoveServer(args, ctx);
    case "sint__issue_token":
      return handleIssueToken(args, ctx);
    case "sint__revoke_token":
      return handleRevokeToken(args, ctx);
    default:
      return text(`Unknown SINT tool: ${toolName}`);
  }
}

function text(content: string): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: "text", text: content }] };
}

function handleStatus(ctx: SintToolContext) {
  const servers = ctx.downstream.listServers();
  const connected = servers.filter((s) => s.status === "connected").length;
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

  return text(JSON.stringify({
    status: "operational",
    agent: ctx.agentPublicKey.slice(0, 16) + "...",
    servers: { total: servers.length, connected },
    tools: totalTools,
    pendingApprovals: ctx.approvalQueue.size,
    ledgerEvents: ctx.ledger.length,
  }, null, 2));
}

function handleServers(ctx: SintToolContext) {
  const servers = ctx.downstream.listServers();
  return text(JSON.stringify(servers, null, 2));
}

function handleWhoami(ctx: SintToolContext) {
  return text(JSON.stringify({
    publicKey: ctx.agentPublicKey,
    tokenId: ctx.tokenId,
    role: "agent",
  }, null, 2));
}

function handlePending(ctx: SintToolContext) {
  const pending = ctx.approvalQueue.getPending();
  if (pending.length === 0) {
    return text("No pending approval requests.");
  }

  const summary = pending.map((p) => ({
    requestId: p.requestId,
    resource: p.request.resource,
    action: p.request.action,
    reason: p.reason,
    expiresAt: p.expiresAt,
  }));
  return text(JSON.stringify(summary, null, 2));
}

function handleApprove(args: Record<string, unknown>, ctx: SintToolContext) {
  const requestId = args["requestId"] as string | undefined;
  if (!requestId) {
    return text("Error: requestId is required");
  }

  const by = (args["by"] as string | undefined) ?? ctx.agentPublicKey.slice(0, 16);
  const resolution = ctx.approvalQueue.resolve(requestId, {
    status: "approved",
    by,
  });

  if (!resolution) {
    return text(`Error: No pending request found with ID "${requestId}"`);
  }

  return text(`Approved request ${requestId} by ${by}`);
}

function handleDeny(args: Record<string, unknown>, ctx: SintToolContext) {
  const requestId = args["requestId"] as string | undefined;
  if (!requestId) {
    return text("Error: requestId is required");
  }

  const by = (args["by"] as string | undefined) ?? ctx.agentPublicKey.slice(0, 16);
  const reason = (args["reason"] as string | undefined) ?? "Denied via sint__deny";
  const resolution = ctx.approvalQueue.resolve(requestId, {
    status: "denied",
    by,
    reason,
  });

  if (!resolution) {
    return text(`Error: No pending request found with ID "${requestId}"`);
  }

  return text(`Denied request ${requestId}: ${reason}`);
}

function handleAudit(args: Record<string, unknown>, ctx: SintToolContext) {
  const limit = (args["limit"] as number | undefined) ?? 20;
  const events = ctx.ledger.getAll();
  const recent = events.slice(-limit);

  if (recent.length === 0) {
    return text("No ledger events recorded yet.");
  }

  const summary = recent.map((e) => ({
    eventId: e.eventId,
    seq: e.sequenceNumber.toString(),
    type: e.eventType,
    agent: e.agentId.slice(0, 16) + "...",
    payload: e.payload,
    timestamp: e.timestamp,
  }));
  return text(JSON.stringify(summary, null, 2));
}

async function handleAddServer(args: Record<string, unknown>, ctx: SintToolContext) {
  const name = args["name"] as string | undefined;
  const command = args["command"] as string | undefined;
  const argsArr = args["args"] as string[] | undefined;

  if (!name || !command) {
    return text("Error: name and command are required");
  }

  try {
    await ctx.downstream.addServer(name, {
      command,
      args: argsArr,
    });
    const info = ctx.downstream.listServers().find((s) => s.name === name);
    return text(`Server "${name}" added successfully with ${info?.toolCount ?? 0} tools`);
  } catch (error) {
    return text(`Error adding server "${name}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleRemoveServer(args: Record<string, unknown>, ctx: SintToolContext) {
  const name = args["name"] as string | undefined;
  if (!name) {
    return text("Error: name is required");
  }

  const removed = await ctx.downstream.removeServer(name);
  if (!removed) {
    return text(`Error: Server "${name}" not found`);
  }

  return text(`Server "${name}" removed successfully`);
}

function handleIssueToken(args: Record<string, unknown>, ctx: SintToolContext) {
  const subject = args["subject"] as string | undefined;
  const resource = args["resource"] as string | undefined;
  const actions = args["actions"] as string[] | undefined;
  const expiresInHours = (args["expiresInHours"] as number | undefined) ?? 24;

  if (!subject || !resource || !actions || actions.length === 0) {
    return text("Error: subject, resource, and actions are required");
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  const result = issueCapabilityToken(
    {
      issuer: ctx.agentPublicKey,
      subject,
      resource,
      actions,
      constraints: {},
      delegationChain: {
        parentTokenId: ctx.tokenId,
        depth: 1,
        attenuated: true,
      },
      expiresAt,
      revocable: true,
    },
    ctx.agentPrivateKey,
  );

  if (!result.ok) {
    return text(`Error issuing token: ${result.error}`);
  }

  // Store the new token
  ctx.tokenStore.set(result.value.tokenId, result.value);

  // Ledger event
  ctx.ledger.append({
    eventType: "token.issued" as any,
    agentId: ctx.agentPublicKey,
    tokenId: result.value.tokenId,
    payload: { subject, resource, actions, expiresAt },
  });

  return text(JSON.stringify({
    tokenId: result.value.tokenId,
    subject,
    resource,
    actions,
    expiresAt,
  }, null, 2));
}

function handleRevokeToken(args: Record<string, unknown>, ctx: SintToolContext) {
  const tokenId = args["tokenId"] as string | undefined;
  const reason = (args["reason"] as string | undefined) ?? "Revoked via sint__revoke_token";

  if (!tokenId) {
    return text("Error: tokenId is required");
  }

  const token = ctx.tokenStore.get(tokenId);
  if (!token) {
    return text(`Error: Token "${tokenId}" not found`);
  }

  // Revoke in the store
  ctx.revocationStore.revoke(tokenId, reason, ctx.agentPublicKey.slice(0, 16));
  ctx.tokenStore.delete(tokenId);

  // Ledger event
  ctx.ledger.append({
    eventType: "token.revoked" as any,
    agentId: ctx.agentPublicKey,
    tokenId,
    payload: { reason },
  });

  return text(`Token ${tokenId} revoked: ${reason}`);
}
