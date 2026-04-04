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

  // Engine — System 1 inference (read-only perception)
  {
    resourcePattern: "engine://system1/*",
    actions: ["inference", "subscribe"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },

  // Engine — System 2 planning (idempotent)
  {
    resourcePattern: "engine://system2/plan",
    actions: ["create", "validate"],
    baseTier: ApprovalTier.T1_PREPARE,
    baseRisk: RiskTier.T1_WRITE_LOW,
  },

  // Engine — System 2 execution (physical state change)
  {
    resourcePattern: "engine://system2/execute",
    actions: ["execute"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },

  // Engine — Capsule loading/execution
  {
    resourcePattern: "engine://capsule/*",
    actions: ["load", "execute", "unload"],
    baseTier: ApprovalTier.T1_PREPARE,
    baseRisk: RiskTier.T1_WRITE_LOW,
  },

  // Engine — HAL hardware detection (read-only)
  {
    resourcePattern: "engine://hal/*",
    actions: ["detect", "monitor"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },

  // ── Google A2A (Agent-to-Agent) tasks ──────────────────────────────────────
  //
  // Default: read/status tasks → OBSERVE, sending tasks → PREPARE.
  // Physical or irreversible A2A tasks escalated by skill tags via EconomyPlugin.
  //
  // Resource format: a2a://<agent-hostname>/<skillId>

  // Generic A2A task send (unknown skill) — defaults to PREPARE
  {
    resourcePattern: "a2a://*",
    actions: ["a2a.send", "a2a.stream"],
    baseTier: ApprovalTier.T1_PREPARE,
    baseRisk: RiskTier.T1_WRITE_LOW,
    escalateOnNewAgent: true,
  },

  // A2A task cancel / status (idempotent operations) — PREPARE
  {
    resourcePattern: "a2a://*",
    actions: ["a2a.cancel", "a2a.get"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },

  // A2A physical movement tasks — ACT (tagged "movement" or "physical")
  // Operators can tag their skills; these rules apply based on skillId paths
  {
    resourcePattern: "a2a://*/navigate",
    actions: ["a2a.send", "a2a.stream"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "a2a://*/move",
    actions: ["a2a.send", "a2a.stream"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "a2a://*/gripper",
    actions: ["a2a.send", "a2a.stream"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },

  // A2A read-only tasks (report, status, inspect) — OBSERVE
  {
    resourcePattern: "a2a://*/report",
    actions: ["a2a.send"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "a2a://*/status",
    actions: ["a2a.send"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },
  {
    resourcePattern: "a2a://*/inspect",
    actions: ["a2a.send"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },

  // A2A irreversible tasks (configure, provision, deploy) — COMMIT
  {
    resourcePattern: "a2a://*/configure",
    actions: ["a2a.send"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },
  {
    resourcePattern: "a2a://*/provision",
    actions: ["a2a.send"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // ── MAVLink (bridge-mavlink) — UAV/drone commands ─────────────────────────
  //
  // Resource format: mavlink://<system_id>/<command_path>
  // Safety rationale: propulsion commands directly affect physical safety of
  // drone in flight. The critical invariant: ARM must NEVER be T0/T1 auto-allow.

  // ARM / DISARM — COMMIT (arming/disarming propulsion is irreversible mid-flight)
  {
    resourcePattern: "mavlink://*/cmd/arm",
    actions: ["call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // Mission start — COMMIT (begins autonomous BVLOS operation)
  {
    resourcePattern: "mavlink://*/cmd/mission",
    actions: ["call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // Mode changes (OFFBOARD, MANUAL, AUTO) — COMMIT (irreversible behavior change)
  {
    resourcePattern: "mavlink://*/cmd/mode",
    actions: ["call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // Geofence disable — COMMIT (removes safety boundary)
  {
    resourcePattern: "mavlink://*/cmd/fence",
    actions: ["call"],
    baseTier: ApprovalTier.T3_COMMIT,
    baseRisk: RiskTier.T3_IRREVERSIBLE,
  },

  // Navigation (takeoff, land, waypoint, RTL, loiter) — ACT (physical movement)
  {
    resourcePattern: "mavlink://*/cmd/takeoff",
    actions: ["call"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "mavlink://*/cmd/land",
    actions: ["call"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "mavlink://*/cmd/nav",
    actions: ["call"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "mavlink://*/cmd/rtl",
    actions: ["call"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
  },

  // Velocity / attitude control — ACT (continuous physical control)
  {
    resourcePattern: "mavlink://*/cmd_vel",
    actions: ["publish"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },
  {
    resourcePattern: "mavlink://*/cmd_att",
    actions: ["publish"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
    escalateOnHumanPresence: true,
  },

  // Speed change — ACT
  {
    resourcePattern: "mavlink://*/cmd/speed",
    actions: ["call"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
  },

  // Gimbal control — ACT (physical actuator)
  {
    resourcePattern: "mavlink://*/cmd/gimbal",
    actions: ["call"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
  },

  // Camera/imaging — OBSERVE (no physical side effects)
  {
    resourcePattern: "mavlink://*/cmd/camera",
    actions: ["call"],
    baseTier: ApprovalTier.T0_OBSERVE,
    baseRisk: RiskTier.T0_READ,
  },

  // Unknown MAVLink commands — ACT (conservative fallback; never auto-allow)
  {
    resourcePattern: "mavlink://*",
    actions: ["call", "publish"],
    baseTier: ApprovalTier.T2_ACT,
    baseRisk: RiskTier.T2_STATEFUL,
  },
] as const;
