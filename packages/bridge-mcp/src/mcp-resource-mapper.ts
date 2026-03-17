/**
 * SINT Bridge-MCP — Resource Mapper.
 *
 * Maps MCP tool names to SINT resource URIs and provides
 * risk classification hints for the tier assignment engine.
 *
 * The URI scheme is: mcp://{serverName}/{toolName}
 *
 * @module @sint/bridge-mcp/mcp-resource-mapper
 */

import { ApprovalTier } from "@sint/core";
import type { MCPRiskHint, MCPToolCall } from "./types.js";

/**
 * Well-known tool categories and their risk classifications.
 * Tools not in this map default to T1_PREPARE.
 */
const TOOL_RISK_MAP: ReadonlyMap<string, MCPRiskHint> = new Map([
  // Read-only tools — T0
  ["filesystem.readFile", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["filesystem.readDirectory", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["filesystem.getFileInfo", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.query", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Write tools — T1
  ["filesystem.writeFile", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["filesystem.createDirectory", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.insert", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Destructive / mutation tools — T2
  ["filesystem.deleteFile", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.delete", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["database.update", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Execution / credential tools — T3
  ["exec.run", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "exec.run",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["exec.shell", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "exec.run",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["credential.read", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["credential.write", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
]);

/** Default risk hint for unknown tools. */
const DEFAULT_RISK_HINT: MCPRiskHint = {
  suggestedTier: ApprovalTier.T1_PREPARE,
  action: "call",
  hasPhysicalEffect: false,
  escalateOnHumanPresence: false,
};

/**
 * Map an MCP tool call to a SINT resource URI.
 *
 * @example
 * ```ts
 * toResourceUri({ serverName: "filesystem", toolName: "writeFile", ... })
 * // => "mcp://filesystem/writeFile"
 * ```
 */
export function toResourceUri(toolCall: MCPToolCall): string {
  return `mcp://${toolCall.serverName}/${toolCall.toolName}`;
}

/**
 * Get a fully qualified tool identifier from server + tool name.
 *
 * @example
 * ```ts
 * toToolId("filesystem", "writeFile")
 * // => "filesystem.writeFile"
 * ```
 */
export function toToolId(serverName: string, toolName: string): string {
  return `${serverName}.${toolName}`;
}

/**
 * Get the risk hint for a given MCP tool call.
 * Falls back to T1_PREPARE for unknown tools.
 */
export function getRiskHint(toolCall: MCPToolCall): MCPRiskHint {
  const toolId = toToolId(toolCall.serverName, toolCall.toolName);
  return TOOL_RISK_MAP.get(toolId) ?? DEFAULT_RISK_HINT;
}

/**
 * Get the SINT action string for a tool call.
 * Most MCP calls are "call", but exec tools use "exec.run".
 */
export function toSintAction(toolCall: MCPToolCall): string {
  return getRiskHint(toolCall).action;
}

/**
 * Check whether a tool call is classified as read-only.
 */
export function isReadOnly(toolCall: MCPToolCall): boolean {
  return getRiskHint(toolCall).suggestedTier === ApprovalTier.T0_OBSERVE;
}

/**
 * Check whether a tool is in the dangerous category (T3).
 */
export function isDangerous(toolCall: MCPToolCall): boolean {
  return getRiskHint(toolCall).suggestedTier === ApprovalTier.T3_COMMIT;
}
