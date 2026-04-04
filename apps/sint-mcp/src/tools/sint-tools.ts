/**
 * SINT MCP — Built-in SINT Tools.
 *
 * These tools are prefixed with "sint__" and provide SINT-specific
 * functionality directly as MCP tools: status, approval workflow,
 * audit trail, server management.
 *
 * @module @sint/mcp/tools/sint-tools
 */

import type { SintCapabilityToken } from "@sint/core";
import type { ApprovalQueue } from "@sint/gate-policy-gateway";
import type { LedgerWriter } from "@sint/gate-evidence-ledger";
import { issueCapabilityToken, type RevocationStore } from "@sint/gate-capability-tokens";
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
      description: "Show SINT MCP status: connected servers, agent identity, queue size, and system health",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "sint__servers",
      description: "List all downstream MCP servers with connection status, tool counts, and health",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "sint__whoami",
      description: "Show current agent identity: public key, active token, session info",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "sint__pending",
      description: "List all pending approval requests awaiting human review",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "sint__approve",
      description: "Approve a pending escalated action by its request ID",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "string", description: "The approval request ID to approve" },
          by: { type: "string", description: "Identifier of the approver (default: current agent)" },
        },
        required: ["requestId"],
      },
    },
    {
      name: "sint__deny",
      description: "Deny a pending escalated action by its request ID",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "string", description: "The approval request ID to deny" },
          reason: { type: "string", description: "Reason for denial" },
          by: { type: "string", description: "Identifier of the denier (default: current agent)" },
        },
        required: ["requestId"],
      },
    },
    {
      name: "sint__audit",
      description: "Query the SINT evidence ledger for recent decisions and events",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max events to return (default: 20)" },
        },
        required: [],
      },
    },
    {
      name: "sint__add_server",
      description: "Dynamically add a new downstream MCP server at runtime",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Unique name for the server" },
          command: { type: "string", description: "Command to spawn the server" },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Arguments for the command",
          },
        },
        required: ["name", "command"],
      },
    },
    {
      name: "sint__remove_server",
      description: "Remove a downstream MCP server by name",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the server to remove" },
        },
        required: ["name"],
      },
    },
    {
      name: "sint__issue_token",
      description: "Issue a new capability token with restricted scope (admin). Returns tokenId on success.",
      inputSchema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Public key of the token subject" },
          resource: { type: "string", description: "Resource URI pattern (e.g. 'mcp://filesystem/*')" },
          actions: {
            type: "array",
            items: { type: "string" },
            description: "Allowed actions (e.g. ['call', 'exec.run'])",
          },
          expiresInHours: { type: "number", description: "Token lifetime in hours (default: 24)" },
        },
        required: ["subject", "resource", "actions"],
      },
    },
    {
      name: "sint__revoke_token",
      description: "Revoke an active capability token by its ID (admin)",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "ID of the token to revoke" },
          reason: { type: "string", description: "Reason for revocation" },
        },
        required: ["tokenId"],
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
