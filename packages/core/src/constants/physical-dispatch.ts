/**
 * Inventory of physical dispatch classes.
 *
 * A classification is not an authorization. `actuate` means the request can
 * move hardware and must not remain an observe/prepare tier. Read-only and
 * explicit staging actions stay below that floor.
 */
import { parseMcpResource } from "./mcp-risk.js";

export type PhysicalDispatchClass = "observe" | "prepare" | "actuate" | "unclassified";

export interface PhysicalDispatchInput {
  readonly resource: string;
  readonly action: string;
  readonly mcpAnnotations?: { readonly readOnlyHint?: boolean };
  readonly executionContext?: {
    readonly vlaActionChunk?: unknown;
  };
}

export interface PhysicalDispatchClassification {
  readonly dispatchClass: PhysicalDispatchClass;
  readonly protocol: string;
  readonly reason: string;
}

const READ_ONLY_ACTION = /^(subscribe|read|observe|get|list|query|status)$/i;
const KNOWN_PHYSICAL_SCHEME = /^(ros2|mavlink|opcua|iot|modbus|plc|open-rmf|humanoid):\/\//i;
const MQTT_SCHEME = /^mqtt(-sparkplug)?:\/\//i;
const MQTT_ACTUATOR_PATH = /\/(cmd|command|dcmd|setpoint|actuator)(\/|$)/i;
const HA_ACTUATOR = /^ha:\/\/[^/]+\/(?:entity\/)?(lock|cover|vacuum|fan|climate|switch)\./i;
const HTTP_ACTUATOR = /^https?:\/\/.+\/(cmd|command|actuator)(\/|$)/i;
const MCP_PHYSICAL_WORDS = new Set([
  "cmd_vel",
  "cmdvel",
  "navigate",
  "navigation",
  "move_base",
  "gripper",
  "grasp",
  "weld",
  "actuate",
  "setpoint",
  "servo",
  "trajectory",
]);

function protocolOf(resource: string): string {
  const match = /^([a-z0-9+.-]+):/i.exec(resource);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

function isMcpPhysicalTool(toolName: string): boolean {
  const underscored = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const compacted = underscored.replace(/_/g, "");
  if (MCP_PHYSICAL_WORDS.has(underscored) || MCP_PHYSICAL_WORDS.has(compacted)) return true;
  return underscored.split("_").some((word) => MCP_PHYSICAL_WORDS.has(word));
}

function isStaging(resource: string, action: string): boolean {
  return (/^ros2:\/\/\/(plan|waypoints)$/i.test(resource) && action === "publish")
    || (/^humanoid:\/\/[^/]+\/[^/]+\/robot\/[^/]+\/plan$/i.test(resource) && action === "prepare")
    || (/^open-rmf:\/\/fleet\/[^/]+\/dispatch$/i.test(resource) && action === "prepare")
    || (/^mavlink:\/\/[^/]+\/cmd\/camera$/i.test(resource) && action === "call");
}

function classified(
  dispatchClass: PhysicalDispatchClass,
  protocol: string,
  reason: string,
): PhysicalDispatchClassification {
  return { dispatchClass, protocol, reason };
}

/**
 * Mark a request as observe, prepare, actuate, or unclassified.
 * An attached VLA action chunk is always an actuating effect, including when
 * the resource name would otherwise look like a generic tool.
 */
export function classifyPhysicalDispatch(
  input: PhysicalDispatchInput,
): PhysicalDispatchClassification {
  const protocol = protocolOf(input.resource);
  if (input.executionContext?.vlaActionChunk !== undefined) {
    return classified("actuate", "vla", "Bounded VLA action chunk is a physical effect");
  }
  if (isStaging(input.resource, input.action)) {
    return classified("prepare", protocol, "Explicit staging action");
  }

  const knownTransport = KNOWN_PHYSICAL_SCHEME.test(input.resource)
    || (MQTT_SCHEME.test(input.resource) && MQTT_ACTUATOR_PATH.test(input.resource));
  if (knownTransport && READ_ONLY_ACTION.test(input.action)) {
    return classified("observe", protocol, "Read-only action on a physical transport");
  }
  if (knownTransport) {
    return classified("actuate", protocol, "Physical command transport requires ACT tier");
  }

  if (HA_ACTUATOR.test(input.resource)) {
    return READ_ONLY_ACTION.test(input.action)
      ? classified("observe", "ha", "Read-only Home Assistant actuator state")
      : classified("actuate", "ha", "Home Assistant actuator command requires ACT tier");
  }

  if (HTTP_ACTUATOR.test(input.resource)) {
    return READ_ONLY_ACTION.test(input.action)
      ? classified("observe", protocol, "Read-only direct actuator route")
      : classified("actuate", protocol, "Direct actuator route requires ACT tier");
  }

  const mcpTool = parseMcpResource(input.resource);
  if (mcpTool) {
    // A known robot tool is actuating even when a caller attaches readOnlyHint.
    // Only an actual read-style action stays at observe.
    if (isMcpPhysicalTool(mcpTool.toolName)) {
      return READ_ONLY_ACTION.test(input.action)
        ? classified("observe", "mcp", "Read-only action on an MCP robot tool")
        : classified("actuate", "mcp", "MCP robot tool requires ACT tier");
    }
    if (input.mcpAnnotations?.readOnlyHint === true || READ_ONLY_ACTION.test(input.action)) {
      return classified("observe", "mcp", "Read-only MCP tool");
    }
  }

  return classified("unclassified", protocol, "No inventoried physical dispatch class");
}
