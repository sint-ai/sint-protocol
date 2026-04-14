/**
 * SINT MCP — MCP Resources.
 *
 * Exposes SINT data (ledger events, tokens, server info, approvals)
 * as browseable MCP resources.
 *
 * @module @sint/mcp/resources/sint-resources
 */

import type { SintCapabilityToken } from "@pshkv/core";
import type { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import type { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import type { DownstreamManager } from "../downstream.js";

/** Context needed by resource handlers. */
export interface ResourceContext {
  readonly downstream: DownstreamManager;
  readonly approvalQueue: ApprovalQueue;
  readonly ledger: LedgerWriter;
  readonly tokenStore: Map<string, SintCapabilityToken>;
}

/** MCP Resource definition. */
export interface MCPResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: string;
}

/**
 * Get the list of all SINT resources.
 */
export function getSintResources(): MCPResource[] {
  return [
    {
      uri: "sint://ledger/recent",
      name: "Recent Ledger Events",
      description: "Last 50 events from the SINT evidence ledger",
      mimeType: "application/json",
    },
    {
      uri: "sint://tokens/active",
      name: "Active Tokens",
      description: "All active capability tokens",
      mimeType: "application/json",
    },
    {
      uri: "sint://approvals/pending",
      name: "Pending Approvals",
      description: "Currently pending approval requests",
      mimeType: "application/json",
    },
    {
      uri: "sint://servers/list",
      name: "Connected Servers",
      description: "All downstream MCP servers and their status",
      mimeType: "application/json",
    },
    {
      uri: "sint://policy/decisions",
      name: "Recent Decisions",
      description: "Recent policy decisions with outcomes",
      mimeType: "application/json",
    },
    {
      uri: "sint://ledger/event/{eventId}",
      name: "Ledger Event Detail",
      description: "Single ledger event by event ID",
      mimeType: "application/json",
    },
    {
      uri: "sint://tokens/{tokenId}",
      name: "Token Detail",
      description: "Single capability token with full details and delegation chain",
      mimeType: "application/json",
    },
  ];
}

/**
 * Read a SINT resource by URI.
 */
export function readSintResource(
  uri: string,
  ctx: ResourceContext,
): { contents: Array<{ uri: string; mimeType: string; text: string }> } | undefined {
  if (uri === "sint://ledger/recent") {
    const events = ctx.ledger.getAll().slice(-50);
    const serialized = events.map((e) => ({
      ...e,
      sequenceNumber: e.sequenceNumber.toString(),
    }));
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(serialized, null, 2),
      }],
    };
  }

  if (uri === "sint://tokens/active") {
    const tokens = Array.from(ctx.tokenStore.values());
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(tokens, null, 2),
      }],
    };
  }

  if (uri === "sint://approvals/pending") {
    const pending = ctx.approvalQueue.getPending();
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(pending, null, 2),
      }],
    };
  }

  if (uri === "sint://servers/list") {
    const servers = ctx.downstream.listServers();
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(servers, null, 2),
      }],
    };
  }

  if (uri === "sint://policy/decisions") {
    // Extract policy.evaluated events from ledger
    const events = ctx.ledger.getAll()
      .filter((e) => e.eventType === "policy.evaluated")
      .slice(-50);
    const serialized = events.map((e) => ({
      ...e,
      sequenceNumber: e.sequenceNumber.toString(),
    }));
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(serialized, null, 2),
      }],
    };
  }

  // ── Dynamic resources ──

  // sint://servers/{name}/tools
  const serverToolsMatch = uri.match(/^sint:\/\/servers\/([^/]+)\/tools$/);
  if (serverToolsMatch) {
    const serverName = serverToolsMatch[1]!;
    const servers = ctx.downstream.listServers();
    const server = servers.find((s) => s.name === serverName);
    if (!server) return undefined;

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(server, null, 2),
      }],
    };
  }

  // sint://ledger/event/{eventId}
  const eventMatch = uri.match(/^sint:\/\/ledger\/event\/(.+)$/);
  if (eventMatch) {
    const eventId = eventMatch[1]!;
    const event = ctx.ledger.getAll().find((e) => e.eventId === eventId);
    if (!event) return undefined;

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          ...event,
          sequenceNumber: event.sequenceNumber.toString(),
        }, null, 2),
      }],
    };
  }

  // sint://tokens/{tokenId}
  const tokenMatch = uri.match(/^sint:\/\/tokens\/([^/]+)$/);
  if (tokenMatch) {
    const tokenId = tokenMatch[1]!;
    if (tokenId === "active") return undefined; // already handled above
    const token = ctx.tokenStore.get(tokenId);
    if (!token) return undefined;

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(token, null, 2),
      }],
    };
  }

  return undefined;
}
