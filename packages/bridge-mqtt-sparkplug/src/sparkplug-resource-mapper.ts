import { ApprovalTier, type BridgeProfile } from "@sint-ai/core";

export const SPARKPLUG_NAMESPACE_PREFIX = "spBv";

export type SparkplugMessageType =
  | "NBIRTH"
  | "DBIRTH"
  | "NDEATH"
  | "DDEATH"
  | "NDATA"
  | "DDATA"
  | "NCMD"
  | "DCMD"
  | "STATE";

export interface SparkplugTopicParts {
  readonly namespace: string;
  readonly groupId: string;
  readonly messageType: string;
  readonly edgeNodeId: string;
  readonly deviceId?: string;
}

const MESSAGE_TYPE_ACTIONS: Readonly<Record<SparkplugMessageType, "observe" | "publish" | "call">> = {
  NBIRTH: "publish",
  DBIRTH: "publish",
  NDEATH: "publish",
  DDEATH: "publish",
  NDATA: "publish",
  DDATA: "publish",
  NCMD: "call",
  DCMD: "call",
  STATE: "observe",
};

const MESSAGE_TYPE_TIERS: Readonly<Record<SparkplugMessageType, ApprovalTier>> = {
  NBIRTH: ApprovalTier.T1_PREPARE,
  DBIRTH: ApprovalTier.T1_PREPARE,
  NDEATH: ApprovalTier.T1_PREPARE,
  DDEATH: ApprovalTier.T1_PREPARE,
  NDATA: ApprovalTier.T0_OBSERVE,
  DDATA: ApprovalTier.T0_OBSERVE,
  NCMD: ApprovalTier.T2_ACT,
  DCMD: ApprovalTier.T2_ACT,
  STATE: ApprovalTier.T0_OBSERVE,
};

const SAFETY_CRITICAL_KEYWORDS = [
  "estop",
  "emergency",
  "safety",
  "shutdown",
  "interlock",
  "override",
];

function encodeSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

/** Parse a Sparkplug topic into canonical components. */
export function parseSparkplugTopic(topic: string): SparkplugTopicParts | undefined {
  const parts = topic.split("/").filter((segment) => segment.length > 0);
  if (parts.length < 3) {
    return undefined;
  }

  const namespace = parts[0];
  const groupOrState = parts[1];
  const messageTypeOrEdge = parts[2];
  const tail = parts.slice(3);

  if (!namespace || !groupOrState || !messageTypeOrEdge) {
    return undefined;
  }

  if (!namespace.startsWith(SPARKPLUG_NAMESPACE_PREFIX)) {
    return undefined;
  }

  // STATE topics do not carry group/device sections.
  if (groupOrState.toUpperCase() === "STATE") {
    const edgeNodeId = messageTypeOrEdge;
    if (!edgeNodeId) {
      return undefined;
    }
    return {
      namespace,
      groupId: "_state",
      messageType: "STATE",
      edgeNodeId,
    };
  }

  if (parts.length < 4) {
    return undefined;
  }

  const edgeNodeId = tail[0];
  if (!edgeNodeId) {
    return undefined;
  }

  return {
    namespace,
    groupId: groupOrState,
    messageType: messageTypeOrEdge,
    edgeNodeId,
    deviceId: tail[1],
  };
}

/** Convert Sparkplug topic to canonical SINT resource URI. */
export function sparkplugTopicToResourceUri(topic: string): string | undefined {
  const parsed = parseSparkplugTopic(topic);
  if (!parsed) {
    return undefined;
  }

  const message = parsed.messageType.toLowerCase();
  const devicePath = parsed.deviceId ? `/${encodeSegment(parsed.deviceId)}` : "";

  return `mqtt-sparkplug:///${encodeSegment(parsed.groupId)}/${encodeSegment(parsed.edgeNodeId)}${devicePath}/${message}`;
}

/** Map Sparkplug message type to canonical SINT action. */
export function sparkplugActionForMessageType(
  messageType: string,
): "observe" | "publish" | "call" {
  const normalized = messageType.toUpperCase() as SparkplugMessageType;
  return MESSAGE_TYPE_ACTIONS[normalized] ?? "publish";
}

/** Default tier mapping for Sparkplug message types. */
export function defaultTierForSparkplug(messageType: string): ApprovalTier {
  const normalized = messageType.toUpperCase() as SparkplugMessageType;
  return MESSAGE_TYPE_TIERS[normalized] ?? ApprovalTier.T1_PREPARE;
}

/**
 * Suggest tier for a concrete Sparkplug topic.
 * Safety-critical command channels are promoted to T3.
 */
export function suggestTierForSparkplugTopic(topic: string): ApprovalTier {
  const parsed = parseSparkplugTopic(topic);
  if (!parsed) {
    return ApprovalTier.T2_ACT;
  }

  const baseTier = defaultTierForSparkplug(parsed.messageType);
  if (baseTier !== ApprovalTier.T2_ACT) {
    return baseTier;
  }

  const loweredTopic = topic.toLowerCase();
  const critical = SAFETY_CRITICAL_KEYWORDS.some((keyword) =>
    loweredTopic.includes(keyword),
  );
  return critical ? ApprovalTier.T3_COMMIT : baseTier;
}

/** Bridge profile used for discovery and interoperability contracts. */
export const MQTT_SPARKPLUG_BRIDGE_PROFILE: BridgeProfile = {
  bridgeId: "mqtt-sparkplug",
  protocol: "mqtt",
  version: "sparkplug-b-v3",
  resourcePattern: "mqtt-sparkplug:///**",
  defaultTierByAction: {
    observe: ApprovalTier.T0_OBSERVE,
    publish: ApprovalTier.T1_PREPARE,
    call: ApprovalTier.T2_ACT,
  },
  notes: "Sparkplug birth/death/data/command channels with conservative command escalation.",
};
