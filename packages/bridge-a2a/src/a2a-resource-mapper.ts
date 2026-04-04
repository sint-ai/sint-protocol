/**
 * SINT Bridge A2A — Resource Mapper.
 *
 * Maps Google A2A tasks to SINT resource URIs and action strings
 * so they can flow through the PolicyGateway.
 *
 * SINT resource URI format for A2A:
 *   `a2a://<agent-hostname>/<skillId>`
 *
 * where <agent-hostname> is derived from the target agent's URL and
 * <skillId> is the skill being invoked (or "task" for generic calls).
 *
 * @module @sint/bridge-a2a/resource-mapper
 */

import type { A2AAgentCard, A2ASendTaskParams, A2ASkill } from "./types.js";

/** SINT action string constants for A2A operations. */
export const A2A_ACTIONS = {
  /** Dispatch a task to another agent (blocking). */
  SEND: "a2a.send",
  /** Subscribe to streaming task updates. */
  STREAM: "a2a.stream",
  /** Cancel a running task. */
  CANCEL: "a2a.cancel",
  /** Retrieve task status. */
  GET: "a2a.get",
} as const;

export type A2AAction = (typeof A2A_ACTIONS)[keyof typeof A2A_ACTIONS];

/**
 * Build the SINT resource URI for an A2A task.
 *
 * Format: `a2a://<hostname>/<skillId>`
 *
 * @example
 * buildResourceUri("https://agents.example.com/fleet-manager", "navigate")
 * // "a2a://agents.example.com/navigate"
 */
export function buildResourceUri(agentUrl: string, skillId?: string): string {
  let hostname: string;
  try {
    hostname = new URL(agentUrl).hostname;
  } catch {
    // Fall back to using the raw URL as the identifier
    hostname = agentUrl.replace(/[^a-zA-Z0-9.-]/g, "-");
  }

  const skill = skillId?.trim() || "task";
  return `a2a://${hostname}/${skill}`;
}

/**
 * Find a skill in an Agent Card by ID or infer from task params.
 */
export function resolveSkill(
  agentCard: A2AAgentCard,
  params: A2ASendTaskParams,
): A2ASkill | undefined {
  if (params.skillId) {
    return agentCard.skills.find((s) => s.id === params.skillId);
  }
  // If only one skill, use it
  if (agentCard.skills.length === 1) {
    return agentCard.skills[0];
  }
  return undefined;
}

/**
 * Extract physical context hints from A2A task params.
 *
 * Some A2A skills carry physical context in their message data parts
 * (e.g. a navigation task includes velocity/position metadata).
 */
export function extractA2APhysicalContext(params: A2ASendTaskParams): {
  humanDetected?: boolean;
  currentVelocityMps?: number;
} | undefined {
  const dataParts = params.message.parts.filter((p) => p.type === "data");
  for (const part of dataParts) {
    if (part.type !== "data") continue;
    const d = part.data;
    if (typeof d["humanDetected"] === "boolean" || typeof d["currentVelocityMps"] === "number") {
      return {
        humanDetected: typeof d["humanDetected"] === "boolean" ? d["humanDetected"] : undefined,
        currentVelocityMps: typeof d["currentVelocityMps"] === "number" ? d["currentVelocityMps"] : undefined,
      };
    }
  }
  return undefined;
}

/**
 * Determine the SINT action string for an A2A method.
 */
export function mapMethodToAction(method: string): A2AAction {
  switch (method) {
    case "tasks/sendSubscribe": return A2A_ACTIONS.STREAM;
    case "tasks/cancel":        return A2A_ACTIONS.CANCEL;
    case "tasks/get":           return A2A_ACTIONS.GET;
    default:                    return A2A_ACTIONS.SEND;
  }
}
