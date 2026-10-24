/** Default-private consumer-media bridge. Authorization is delegated exclusively to PolicyGateway.intercept(). */
import type { ApprovalTier, PolicyDecision, SintRequest } from "@pshkv/core";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";

export type ConsumerMediaDataClass =
  | "playback-metadata" | "acr-fingerprint" | "raw-frame" | "ambient-audio"
  | "voice-transcript" | "camera-frame" | "lan-inventory" | "wifi-environment";
export type ConsumerMediaOperation =
  | "observe" | "collect" | "fingerprint" | "retain" | "upload" | "share"
  | "discover" | "activate" | "renew" | "stop" | "update" | "remote-admin";

export interface ConsumerMediaGateway { intercept(request: SintRequest): Promise<PolicyDecision>; }
export interface ConsumerMediaSession {
  readonly householdId: string;
  readonly roomId: string;
  readonly deviceId: string;
  readonly agentId: string;
  readonly tokenId: string;
}
export interface ConsumerMediaRequest {
  readonly operation: ConsumerMediaOperation;
  readonly dataClass?: ConsumerMediaDataClass;
  /** Required for upload/share; included in the resource so a token binds one recipient. */
  readonly recipient?: string;
  readonly purpose?: string;
  readonly retentionDeadline?: string;
  /** Stable id for a continuing microphone, camera, or other sensor effect. */
  readonly effectId?: string;
}
export interface ConsumerMediaResult {
  readonly action: "forward" | "deny" | "escalate";
  readonly decision: PolicyDecision;
  readonly resource: string;
  readonly requiredTier?: ApprovalTier;
  readonly denyReason?: string;
}

function segment(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("Consumer media URI components must be identifier-safe");
  return value;
}

export function toConsumerMediaResource(session: Pick<ConsumerMediaSession, "householdId" | "roomId" | "deviceId">, request: ConsumerMediaRequest): string {
  const base = `tv://${segment(session.householdId)}/${segment(session.roomId)}/${segment(session.deviceId)}`;
  if (request.operation === "observe") return `${base}/status`;
  if (request.operation === "discover") return `${base}/network/discovery`;
  if (request.operation === "update" || request.operation === "remote-admin") return `${base}/management/${request.operation}`;
  if (request.operation === "renew" || request.operation === "stop") {
    if (!request.effectId) throw new Error(`${request.operation} requires an effectId`);
    return `${base}/effect/${segment(request.effectId)}`;
  }
  if (request.operation === "upload" || request.operation === "share") {
    if (!request.recipient) throw new Error(`${request.operation} requires a recipient`);
    return `${base}/egress/${segment(request.recipient)}`;
  }
  const dataClass = request.dataClass;
  if (!dataClass) throw new Error(`${request.operation} requires a dataClass`);
  if (dataClass === "acr-fingerprint") return `${base}/display/acr-fingerprint`;
  return `${base}/sensor/${segment(dataClass)}`;
}

export class ConsumerMediaInterceptor {
  constructor(private readonly gateway: ConsumerMediaGateway) {}

  async intercept(session: ConsumerMediaSession, operation: ConsumerMediaRequest): Promise<ConsumerMediaResult> {
    const resource = toConsumerMediaResource(session, operation);
    const request: SintRequest = {
      requestId: generateUUIDv7(), timestamp: nowISO8601(), agentId: session.agentId,
      tokenId: session.tokenId as SintRequest["tokenId"], resource, action: operation.operation,
      params: { dataClass: operation.dataClass, recipient: operation.recipient, purpose: operation.purpose, retentionDeadline: operation.retentionDeadline, effectId: operation.effectId },
      executionContext: { deploymentProfile: "home-media-private", bridgeId: "consumer-media", bridgeProtocol: "consumer-media-v1" },
    };
    const decision = await this.gateway.intercept(request);
    if (decision.action === "allow") return { action: "forward", decision, resource };
    if (decision.action === "escalate") {
      return { action: "escalate", decision, resource, requiredTier: decision.escalation?.requiredTier };
    }
    return { action: "deny", decision, resource, denyReason: decision.denial?.reason };
  }
}
