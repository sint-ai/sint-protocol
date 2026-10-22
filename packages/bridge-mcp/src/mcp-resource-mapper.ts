/** MCP resource mapping; risk semantics are shared with the gateway. */
import { ApprovalTier, classifyMcpTool, isMcpShellExecTool, mcpTierFromAnnotations } from "@pshkv/core";
import type { MCPRiskHint, MCPToolAnnotations, MCPToolCall } from "./types.js";
export type { MCPToolAnnotations };
export const tierFromAnnotations = mcpTierFromAnnotations;
export const isShellExecTool = isMcpShellExecTool;
export function toResourceUri(toolCall: MCPToolCall): string {
  return `mcp://${toolCall.serverName}/${toolCall.toolName}`;
}
export function toToolId(serverName: string, toolName: string): string {
  return `${serverName}.${toolName}`;
}
export function getRiskHint(toolCall: MCPToolCall): MCPRiskHint {
  return classifyMcpTool(toolCall);
}
export function toSintAction(toolCall: MCPToolCall): string {
  return getRiskHint(toolCall).action;
}
export function isReadOnly(toolCall: MCPToolCall): boolean {
  return getRiskHint(toolCall).suggestedTier === ApprovalTier.T0_OBSERVE;
}
export function isDangerous(toolCall: MCPToolCall): boolean {
  return getRiskHint(toolCall).suggestedTier === ApprovalTier.T3_COMMIT;
}
