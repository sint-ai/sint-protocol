import { ApprovalTier, type BridgeProfile } from "@sint/core";

export type OpcUaOperation = "read" | "write" | "call" | "subscribe" | "browse";

const SAFETY_CRITICAL_KEYWORDS = [
  "safety",
  "emergency",
  "estop",
  "shutdown",
  "interlock",
  "mode",
  "enable",
  "disable",
  "stop",
  "start",
];

function normalizeEndpointHost(endpoint?: string): string {
  if (!endpoint) {
    return "local";
  }

  try {
    const parsed = new URL(endpoint);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return endpoint.replace(/[^a-zA-Z0-9.-:]/g, "_");
  }
}

function encodeNode(value: string): string {
  return encodeURIComponent(value.trim());
}

/** Convert an OPC UA node identifier to canonical SINT URI. */
export function opcUaNodeToResourceUri(nodeId: string, endpoint?: string): string {
  const host = normalizeEndpointHost(endpoint);
  return `opcua://${host}/${encodeNode(nodeId)}`;
}

/** Convert OPC UA method invocation target to canonical SINT URI. */
export function opcUaMethodToResourceUri(
  objectNodeId: string,
  methodNodeId: string,
  endpoint?: string,
): string {
  const host = normalizeEndpointHost(endpoint);
  return `opcua://${host}/${encodeNode(objectNodeId)}/method/${encodeNode(methodNodeId)}`;
}

/** Map OPC UA operation to canonical SINT action string. */
export function opcUaOperationToAction(operation: OpcUaOperation): "observe" | "read" | "write" | "call" {
  switch (operation) {
    case "read":
      return "read";
    case "browse":
    case "subscribe":
      return "observe";
    case "write":
      return "write";
    case "call":
      return "call";
  }
}

/** Identify high-risk nodes that should default to T3 on write/call paths. */
export function isSafetyCriticalNode(nodePath: string): boolean {
  const lowered = nodePath.toLowerCase();
  return SAFETY_CRITICAL_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

/** Default tier mapping for OPC UA operations. */
export function defaultTierForOpcUaOperation(
  operation: OpcUaOperation,
  nodePath?: string,
): ApprovalTier {
  if (operation === "read" || operation === "subscribe" || operation === "browse") {
    return ApprovalTier.T0_OBSERVE;
  }

  if (operation === "write" || operation === "call") {
    if (nodePath && isSafetyCriticalNode(nodePath)) {
      return ApprovalTier.T3_COMMIT;
    }
    return ApprovalTier.T2_ACT;
  }

  return ApprovalTier.T1_PREPARE;
}

/** Bridge profile for OPC UA interoperability and discovery. */
export const OPCUA_BRIDGE_PROFILE: BridgeProfile = {
  bridgeId: "opcua",
  protocol: "opcua",
  version: "1.05+",
  resourcePattern: "opcua://*/**",
  defaultTierByAction: {
    observe: ApprovalTier.T0_OBSERVE,
    read: ApprovalTier.T0_OBSERVE,
    write: ApprovalTier.T2_ACT,
    call: ApprovalTier.T2_ACT,
  },
  notes: "OT/PLC bridge profile with safety-critical write/call promotion to T3.",
};
