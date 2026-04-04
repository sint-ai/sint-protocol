/**
 * SINT Protocol — Default forbidden tool combinations.
 *
 * These are sequences of actions that, when performed by the same agent
 * within a time window, indicate potential capability laundering or
 * attack escalation. They must be blocked or escalated to T3_COMMIT.
 *
 * @module @sint/core/constants/forbidden-combos
 */

import { ApprovalTier } from "../types/policy.js";
import type { ForbiddenCombination } from "../types/policy.js";

/**
 * Default forbidden combinations.
 * Based on documented MCP breach patterns and SROS2 vulnerabilities.
 */
export const DEFAULT_FORBIDDEN_COMBOS: readonly ForbiddenCombination[] = [
  {
    sequence: ["filesystem.write", "exec.run"],
    windowMs: 60_000,
    requiredTier: ApprovalTier.T3_COMMIT,
    reason: "Capability laundering: write-then-execute is a code injection vector",
  },
  {
    sequence: ["filesystem.write", "filesystem.chmod", "exec.run"],
    windowMs: 120_000,
    requiredTier: ApprovalTier.T3_COMMIT,
    reason: "Capability laundering: write-chmod-execute escalation chain",
  },
  {
    sequence: ["network.connect", "filesystem.write"],
    windowMs: 30_000,
    requiredTier: ApprovalTier.T3_COMMIT,
    reason: "Potential exfiltration: download-then-save from untrusted source",
  },
  {
    sequence: ["credential.read", "network.connect"],
    windowMs: 30_000,
    requiredTier: ApprovalTier.T3_COMMIT,
    reason: "Credential theft: read-then-exfiltrate pattern",
  },
  {
    sequence: ["ros2.cmd_vel.publish", "ros2.mode_change.call"],
    windowMs: 5_000,
    requiredTier: ApprovalTier.T3_COMMIT,
    reason: "Unsafe transition: movement command followed by mode change",
  },
  {
    sequence: ["ros2.estop.override", "ros2.cmd_vel.publish"],
    windowMs: 10_000,
    requiredTier: ApprovalTier.T3_COMMIT,
    reason: "Safety bypass: e-stop override followed by movement is always dangerous",
  },

  // Engine — anomaly detected then plan step executed is suspicious
  {
    sequence: ["engine.system1.anomaly", "engine.system2.plan.step.executed"],
    windowMs: 5_000,
    requiredTier: ApprovalTier.T3_COMMIT,
    reason: "Anomaly-then-act: executing a plan step during anomaly requires human approval",
  },

  // Engine — newly loaded capsule immediately publishing cmd_vel
  {
    sequence: ["capsule.loaded", "ros2.cmd_vel.publish"],
    windowMs: 10_000,
    requiredTier: ApprovalTier.T2_ACT,
    reason: "Capsule cold-start movement: newly loaded capsule should not immediately command motion",
  },
] as const;
