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

import { ApprovalTier } from "@pshkv/core";
import type { MCPRiskHint, MCPToolAnnotations, MCPToolCall } from "./types.js";

export type { MCPToolAnnotations };

/**
 * Resolve SINT approval tier from MCP tool annotations (MCP spec §tool-annotations).
 * Annotations take precedence over keyword-based risk hints when present.
 */
export function tierFromAnnotations(annotations: MCPToolAnnotations): ApprovalTier | undefined {
  if (annotations.readOnlyHint === true) return ApprovalTier.T0_OBSERVE;
  if (annotations.destructiveHint === true) return ApprovalTier.T3_COMMIT;
  // openWorldHint = tool can interact with external systems (at least T1)
  if (annotations.openWorldHint === true) return ApprovalTier.T1_PREPARE;
  return undefined; // fall through to keyword-based classification
}

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

  // ── Conway Terminal / Cloud Sandbox tools ──

  // Sandbox observation — T0 (read-only)
  ["conway.sandbox_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_read_file", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_get_url", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_read", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.credits_balance", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.credits_history", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_info", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_list", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_search", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_check", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_pricing", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.credits_pricing", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.wallet_info", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.wallet_networks", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.x402_discover", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.x402_check", {
    suggestedTier: ApprovalTier.T0_OBSERVE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Sandbox write / mutate — T1 (safe writes)
  ["conway.sandbox_write_file", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_write", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_create", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_pty_close", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_add", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_update", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.chat_completions", {
    suggestedTier: ApprovalTier.T1_PREPARE,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Sandbox infra changes — T2 (state-changing, reviewable)
  ["conway.sandbox_create", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_expose_port", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_dns_delete", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_privacy", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_nameservers", {
    suggestedTier: ApprovalTier.T2_ACT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],

  // Irreversible / financial — T3 (human approval required)
  ["conway.sandbox_exec", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "exec.run",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.sandbox_delete", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_register", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.domain_renew", {
    suggestedTier: ApprovalTier.T3_COMMIT,
    action: "call",
    hasPhysicalEffect: false,
    escalateOnHumanPresence: false,
  }],
  ["conway.x402_fetch", {
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

// ASI05: shell/code execution → T3_COMMIT
// Tool names that indicate shell or code execution and must be classified T3_COMMIT.
const SHELL_EXEC_TOOL_KEYWORDS: readonly string[] = [
  "execute",
  "exec",
  "shell",
  "bash",
  "sh",
  "cmd",
  "powershell",
  "run_command",
  "system",
  "eval",
  "subprocess",
];

// ASI05: servers known to provide shell/code execution capabilities → T3_COMMIT
const SHELL_EXEC_SERVER_NAMES: readonly string[] = [
  "shell",
  "terminal",
  "bash",
  "exec",
  "code-interpreter",
];

/**
 * Risk hint for shell/exec tools classified by keyword (ASI05).
 * Uses "call" (not "exec.run") so standard capability tokens (which permit "call")
 * still validate. The elevated tier (T3_COMMIT) provides the security enforcement.
 */
const SHELL_EXEC_RISK_HINT: MCPRiskHint = {
  suggestedTier: ApprovalTier.T3_COMMIT,
  action: "call",
  hasPhysicalEffect: false,
  escalateOnHumanPresence: false,
};

/**
 * Returns true if the tool call is a shell/code execution tool (ASI05).
 * Checks tool name keywords and known shell server names.
 */
export function isShellExecTool(toolCall: MCPToolCall): boolean {
  const toolNameLower = toolCall.toolName.toLowerCase();
  const serverNameLower = toolCall.serverName.toLowerCase();
  // Check if tool name exactly matches or contains any shell keyword
  if (SHELL_EXEC_TOOL_KEYWORDS.some((kw) => toolNameLower === kw || toolNameLower.includes(kw))) {
    return true;
  }
  // Check if server name is a known shell server
  if (SHELL_EXEC_SERVER_NAMES.some((s) => serverNameLower === s || serverNameLower.includes(s))) {
    return true;
  }
  return false;
}

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
 * Priority order:
 *   1. MCP tool annotations (if present) — override everything
 *   2. Explicit TOOL_RISK_MAP entries
 *   3. ASI05 shell/exec keyword detection → T3_COMMIT
 *   4. Default T1_PREPARE for unknown tools
 */
export function getRiskHint(toolCall: MCPToolCall): MCPRiskHint {
  // Annotations take precedence when present (MCP spec §tool-annotations)
  if (toolCall.annotations) {
    const annotationTier = tierFromAnnotations(toolCall.annotations);
    if (annotationTier !== undefined) {
      return {
        suggestedTier: annotationTier,
        action: annotationTier === ApprovalTier.T3_COMMIT ? "exec.run" : "call",
        hasPhysicalEffect: false,
        escalateOnHumanPresence: false,
      };
    }
  }

  // Explicit map (preserves existing exact-match behaviour).
  const toolId = toToolId(toolCall.serverName, toolCall.toolName);
  const explicit = TOOL_RISK_MAP.get(toolId);
  if (explicit) return explicit;

  // ASI05: if tool name or server name indicates shell/code execution → T3_COMMIT
  if (isShellExecTool(toolCall)) {
    return SHELL_EXEC_RISK_HINT;
  }

  return DEFAULT_RISK_HINT;
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
