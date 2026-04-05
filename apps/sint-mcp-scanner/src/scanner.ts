/**
 * SINT MCP Security Scanner — analyzes MCP server tool definitions for risk.
 *
 * Maps tool annotations and descriptions to SINT approval tiers and
 * produces structured risk reports for MCP server auditing.
 *
 * @module @pshkv/mcp-scanner/scanner
 */

import { ApprovalTier } from "@sint/core";
import {
  getRiskHint,
  isShellExecTool,
  tierFromAnnotations,
} from "@sint/bridge-mcp";
import type { MCPToolAnnotations } from "@sint/bridge-mcp";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Result of scanning a single MCP tool definition.
 */
export interface ToolScanResult {
  readonly toolName: string;
  readonly serverId: string;
  readonly assignedTier: ApprovalTier;
  readonly riskLevel: RiskLevel;
  readonly reasons: string[];
  readonly annotations?: MCPToolAnnotations;
  readonly isShellExec: boolean;
  readonly requiresHumanApproval: boolean;
}

/**
 * Aggregated scan report for an MCP server.
 */
export interface ServerScanReport {
  readonly serverId: string;
  readonly scannedAt: string;
  readonly totalTools: number;
  readonly byRisk: { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
  readonly criticalTools: ToolScanResult[];
  readonly highTools: ToolScanResult[];
  readonly allTools: ToolScanResult[];
  readonly overallRisk: RiskLevel;
  readonly recommendations: string[];
}

/**
 * Map an ApprovalTier to a risk level string.
 *   T0_OBSERVE  → LOW
 *   T1_PREPARE  → MEDIUM
 *   T2_ACT      → HIGH
 *   T3_COMMIT   → CRITICAL
 */
function tierToRiskLevel(tier: ApprovalTier): RiskLevel {
  switch (tier) {
    case ApprovalTier.T0_OBSERVE:
      return "LOW";
    case ApprovalTier.T1_PREPARE:
      return "MEDIUM";
    case ApprovalTier.T2_ACT:
      return "HIGH";
    case ApprovalTier.T3_COMMIT:
      return "CRITICAL";
    default:
      return "MEDIUM";
  }
}

/**
 * Determine whether a tier requires human approval (T2+).
 */
function requiresHumanApproval(tier: ApprovalTier): boolean {
  return tier === ApprovalTier.T2_ACT || tier === ApprovalTier.T3_COMMIT;
}

/**
 * Scan a single MCP tool definition for risk.
 */
export function scanTool(
  serverId: string,
  toolName: string,
  description: string,
  annotations?: MCPToolAnnotations,
): ToolScanResult {
  const reasons: string[] = [];

  // Build a synthetic tool call for use with bridge-mcp classifiers
  const syntheticCall = {
    callId: `scan-${serverId}-${toolName}`,
    serverName: serverId,
    toolName,
    arguments: {} as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    annotations,
  };

  const shellExec = isShellExecTool(syntheticCall);
  const hint = getRiskHint(syntheticCall);
  const assignedTier = hint.suggestedTier;

  // Build reasoning
  if (annotations) {
    const annotationTier = tierFromAnnotations(annotations);
    if (annotationTier !== undefined) {
      if (annotations.readOnlyHint) reasons.push("MCP annotation: readOnlyHint=true → read-only tool");
      if (annotations.destructiveHint) reasons.push("MCP annotation: destructiveHint=true → destructive operations");
      if (annotations.openWorldHint) reasons.push("MCP annotation: openWorldHint=true → external system interaction");
    }
    if (annotations.idempotentHint) reasons.push("MCP annotation: idempotentHint=true → idempotent (lower risk)");
  }

  if (shellExec && !annotations?.readOnlyHint) {
    reasons.push("Tool name or server ID matches shell/exec keyword (ASI05)");
  }

  if (reasons.length === 0) {
    // Classify reason based on assigned tier
    switch (assignedTier) {
      case ApprovalTier.T0_OBSERVE:
        reasons.push("Tool classified as read-only via known tool map");
        break;
      case ApprovalTier.T1_PREPARE:
        reasons.push("Tool classified as low-impact write or unknown tool (default T1)");
        break;
      case ApprovalTier.T2_ACT:
        reasons.push("Tool classified as destructive/state-changing operation");
        break;
      case ApprovalTier.T3_COMMIT:
        reasons.push("Tool classified as irreversible or credential-handling operation");
        break;
    }
  }

  // Add description-based reasoning for common patterns
  const descLower = description.toLowerCase();
  if (descLower.includes("delete") || descLower.includes("remove") || descLower.includes("destroy")) {
    if (!reasons.some(r => r.includes("destructive"))) {
      reasons.push("Description indicates destructive operation (delete/remove/destroy)");
    }
  }
  if (descLower.includes("execute") || descLower.includes("run command") || descLower.includes("shell")) {
    if (!reasons.some(r => r.includes("ASI05"))) {
      reasons.push("Description indicates code/command execution capability");
    }
  }

  const riskLevel = tierToRiskLevel(assignedTier);

  return {
    toolName,
    serverId,
    assignedTier,
    riskLevel,
    reasons,
    annotations,
    isShellExec: shellExec,
    requiresHumanApproval: requiresHumanApproval(assignedTier),
  };
}

/**
 * Determine the overall risk level for a server (highest single tool risk).
 */
function computeOverallRisk(tools: ToolScanResult[]): RiskLevel {
  const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  let max: RiskLevel = "LOW";
  for (const tool of tools) {
    if (order.indexOf(tool.riskLevel) > order.indexOf(max)) {
      max = tool.riskLevel;
    }
  }
  return max;
}

/**
 * Generate recommendations based on scan results.
 */
function generateRecommendations(tools: ToolScanResult[]): string[] {
  const recs: string[] = [];
  const criticalCount = tools.filter(t => t.riskLevel === "CRITICAL").length;
  const highCount = tools.filter(t => t.riskLevel === "HIGH").length;
  const shellExecCount = tools.filter(t => t.isShellExec).length;

  if (criticalCount > 0) {
    recs.push("Require human approval for CRITICAL tools before any agent invocation.");
  }
  if (highCount > 0) {
    recs.push("Require human approval for HIGH risk tools; consider adding approval workflows.");
  }
  if (shellExecCount > 0) {
    recs.push(
      `${shellExecCount} shell/exec tool(s) detected — restrict to verified sandboxes only (ASI05).`,
    );
  }
  if (criticalCount > 0 || highCount > 0) {
    recs.push(
      "Register tool definitions with InMemoryToolRegistry to detect drift/poisoning attacks.",
    );
    recs.push("Enable SINT capability tokens with strict resource scoping for high-risk tools.");
  }
  if (tools.length === 0) {
    recs.push("No tools found in scan. Verify MCP server connectivity.");
  }
  return recs;
}

/**
 * Scan all tools on an MCP server and produce an aggregated report.
 */
export function scanServer(
  serverId: string,
  tools: Array<{ name: string; description: string; annotations?: MCPToolAnnotations }>,
): ServerScanReport {
  const allTools = tools.map(t => scanTool(serverId, t.name, t.description, t.annotations));

  const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const tool of allTools) {
    byRisk[tool.riskLevel]++;
  }

  const criticalTools = allTools.filter(t => t.riskLevel === "CRITICAL");
  const highTools = allTools.filter(t => t.riskLevel === "HIGH");
  const overallRisk = computeOverallRisk(allTools);
  const recommendations = generateRecommendations(allTools);

  return {
    serverId,
    scannedAt: new Date().toISOString(),
    totalTools: tools.length,
    byRisk,
    criticalTools,
    highTools,
    allTools,
    overallRisk,
    recommendations,
  };
}
