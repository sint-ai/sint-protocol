/**
 * Cross-system policy enforcement.
 *
 * Example: "if cmd_vel active → deny system.run" or
 * "if robot moving → deny fs.write"
 *
 * These are policies that span multiple subsystems —
 * the key differentiator between SINT and basic sandbox.
 */

import type { CrossSystemPolicy, GovernanceResult, SintTier } from "./types.js";

/** Active system states tracked by the adapter. */
export class SystemStateTracker {
  private activeStates = new Set<string>();

  /** Register an active state (e.g., "cmd_vel", "robot.moving", "deploy.running"). */
  activate(state: string): void {
    this.activeStates.add(state);
  }

  /** Deactivate a state. */
  deactivate(state: string): void {
    this.activeStates.delete(state);
  }

  /** Check if a state is active. */
  isActive(state: string): boolean {
    return this.activeStates.has(state);
  }

  /** Get all active states. */
  getActive(): ReadonlySet<string> {
    return this.activeStates;
  }

  /** Clear all states. */
  clear(): void {
    this.activeStates.clear();
  }
}

/**
 * Evaluate cross-system policies.
 *
 * Returns a denial GovernanceResult if any policy matches, or null if all clear.
 */
export function evaluateCrossSystemPolicies(
  resource: string,
  action: string,
  policies: CrossSystemPolicy[],
  stateTracker: SystemStateTracker,
  tier: SintTier,
): GovernanceResult | null {
  for (const policy of policies) {
    if (!stateTracker.isActive(policy.whenActive)) continue;

    // Check if this action matches any denied pattern.
    // Patterns match against: the full resource:action string,
    // the raw resource, or simplified forms (e.g., "fs:write*" matches "openclaw.tool:write").
    const fullAction = `${resource}:${action}`;
    const matches = policy.denyActions.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern === fullAction) return true;
      if (pattern.endsWith("*") && fullAction.startsWith(pattern.slice(0, -1)))
        return true;
      // Also match against simplified resource (strip openclaw.tool: prefix)
      const simplified = resource.replace(/^openclaw\.(tool|mcp|node):/, "");
      const simpleFull = `${simplified}:${action}`;
      if (pattern === simpleFull) return true;
      if (pattern.endsWith("*") && simpleFull.startsWith(pattern.slice(0, -1)))
        return true;
      return false;
    });

    if (matches) {
      return {
        allowed: false,
        tier,
        outcome: "deny",
        reason: `[Cross-System Policy: ${policy.name}] ${policy.reason} (active: ${policy.whenActive})`,
      };
    }
  }

  return null;
}

/**
 * Built-in cross-system policies for physical AI safety.
 */
export const DEFAULT_PHYSICAL_POLICIES: CrossSystemPolicy[] = [
  {
    name: "no-fs-while-moving",
    whenActive: "robot.moving",
    denyActions: ["write:*", "edit:*", "fs:write*", "fs:delete*"],
    reason: "File system writes denied while robot is in motion — prevents controller corruption",
  },
  {
    name: "no-exec-while-moving",
    whenActive: "robot.moving",
    denyActions: ["exec:*", "system:exec*", "system:run*"],
    reason: "Shell execution denied while robot is in motion — prevents control interference",
  },
  {
    name: "no-deploy-while-active",
    whenActive: "cmd_vel",
    denyActions: ["deploy:*", "system:restart*", "gateway:*"],
    reason: "Deployment and restarts denied while velocity commands are active",
  },
  {
    name: "no-network-while-armed",
    whenActive: "drone.armed",
    denyActions: ["network:*", "exec:*", "system:exec*"],
    reason: "Network and system access denied while drone is armed — safety critical",
  },
];
