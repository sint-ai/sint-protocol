/**
 * SINT Protocol — Tier constants and mappings.
 *
 * @module @sint/core/constants/tiers
 */

import { ApprovalTier, RiskTier } from "../types/policy.js";
import type { TierAssignmentRule } from "../types/policy.js";

/** Maximum allowed delegation depth for capability tokens. */
export const MAX_DELEGATION_DEPTH = 3;

/** Default approval timeout in milliseconds (30 seconds). */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 30_000;

/** Maximum approval timeout in milliseconds (5 minutes). */
export const MAX_APPROVAL_TIMEOUT_MS = 300_000;

/**
 * Default tier assignment rules for common ROS 2 resources.
 * These can be extended or overridden by policy configuration.
 *
 * @example
 * ```ts
 * const rules = DEFAULT_TIER_RULES;
 * const cmdVelRule = rules.find(r => r.resourcePattern === "ros2:///cmd_vel");
 * // cmdVelRule.baseTier === ApprovalTier.T2_ACT
 * ```
 */
export const DEFAULT_TIER_RULES: readonly TierAssignmentRule[] = [
  // Sensor reads — always OBSERVE
  {
    resourcePattern: "ros2:///camera/*",
    actions: ["subscribe"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "ros2:///sensor/*",
    actions: ["subscribe"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "ros2:///battery/*",
    actions: ["subscribe"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "ros2:///diagnostics",
    actions: ["subscribe"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },

  // Navigation planning — PREPARE
  {
    resourcePattern: "ros2:///plan",
    actions: ["publish"],
    baseTier: ApprovalTier.T1_PREPARE,
    baseRisk: RiskTier.T1_WRITE_LOW,
  },
  {
    resourcePattern: "ros2:///waypoints",
    actions: ["publish"],
    baseTier: ApprovalTier.T1_PREPARE,
    baseRisk: RiskTier.T1_WRITE_LOW,
  },

  // Movement commands — ACT (physical state change)
  {
    resourcePattern: "ros2:///cmd_vel",
    actions: ["publish"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "ros2:///joint_commands",
    actions: ["publish"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "ros2:///gripper/*",
    actions: ["publish", "call"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },

  // Mode changes / E-stop — COMMIT (irreversible consequences)
  {
    resourcePattern: "ros2:///mode_change",
    actions: ["publish", "call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // MCP tool calls — default to PREPARE, escalated by specific tools
  {
    resourcePattern: "mcp://*",
    actions: ["call"],
    baseTier: ApprovalTier.T1_PREPARE,
    baseRisk: RiskTier.T1_WRITE_LOW,
    escalateOnNewAgent: true,
  },

  // MCP read-only tools — OBSERVE
  {
    resourcePattern: "mcp://filesystem/readFile",
    actions: ["call"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "mcp://filesystem/readDirectory",
    actions: ["call"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "mcp://filesystem/getFileInfo",
    actions: ["call"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "mcp://database/query",
    actions: ["call"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },

  // MCP write tools — PREPARE
  {
    resourcePattern: "mcp://filesystem/writeFile",
    actions: ["call"],
    baseTier: ApprovalTier.T1_PREPARE,
    baseRisk: RiskTier.T1_WRITE_LOW,
  },

  // MCP execution tools — COMMIT (code execution is irreversible)
  {
    resourcePattern: "mcp://exec/*",
    actions: ["call", "exec.run"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // MCP credential tools — COMMIT (credential access is sensitive)
  {
    resourcePattern: "mcp://credential/*",
    actions: ["call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // Financial operations — always COMMIT
  {
    resourcePattern: "mcp://*/trade.*",
    actions: ["call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },
  {
    resourcePattern: "mcp://*/transfer.*",
    actions: ["call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },
] as const;
