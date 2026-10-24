/** Default-private consumer-media bridge. Authorization is delegated exclusively to PolicyGateway.intercept(). */
import { ok, err, type Result, type ApprovalTier, type PolicyDecision, type SintRequest } from "@pshkv/core";
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

export interface ConsumerMediaInputError {
  readonly code: "INVALID_MEDIA_REQUEST";
  readonly message: string;
}

export function toConsumerMediaResource(session: Pick<ConsumerMediaSession, "householdId" | "roomId" | "deviceId">, request: ConsumerMediaRequest): Result<string, ConsumerMediaInputError> {
  const invalid = (message: string) => err<ConsumerMediaInputError>({ code: "INVALID_MEDIA_REQUEST", message });
  const isIdentifier = (value: unknown): value is string => typeof value === "string"
    && /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
  if ([session.householdId, session.roomId, session.deviceId].some(value => !isIdentifier(value))
    || [request.effectId, request.recipient].some(value => value !== undefined && !isIdentifier(value))) {
    return invalid("Consumer media URI components must be identifier-safe");
  }
  if (!["observe", "collect", "fingerprint", "retain", "upload", "share", "discover", "activate", "renew", "stop", "update", "remote-admin"].includes(request.operation)) {
    return invalid("Unknown consumer media operation");
  }
  if (request.dataClass !== undefined && !["playback-metadata", "acr-fingerprint", "raw-frame", "ambient-audio", "voice-transcript", "camera-frame", "lan-inventory", "wifi-environment"].includes(request.dataClass)) {
    return invalid("Unknown consumer media data class");
  }
  const base = `tv://${session.householdId}/${session.roomId}/${session.deviceId}`;
  if (request.operation === "observe") return ok(`${base}/status`);
  if (request.operation === "discover") return ok(`${base}/network/discovery`);
  if (request.operation === "update" || request.operation === "remote-admin") return ok(`${base}/management/${request.operation}`);
  if (request.operation === "renew" || request.operation === "stop") {
    if (!request.effectId) return invalid(`${request.operation} requires an effectId`);
    return ok(`${base}/effect/${request.effectId}`);
  }
  if (request.operation === "upload" || request.operation === "share") {
    if (!request.recipient) return invalid(`${request.operation} requires a recipient`);
    return ok(`${base}/egress/${request.recipient}`);
  }
  if (!request.dataClass) return invalid(`${request.operation} requires a dataClass`);
  if (request.dataClass === "acr-fingerprint") return ok(`${base}/display/acr-fingerprint`);
  return ok(`${base}/sensor/${request.dataClass}`);
}

export class ConsumerMediaInterceptor {
  constructor(private readonly gateway: ConsumerMediaGateway) {}

  async intercept(session: ConsumerMediaSession, operation: ConsumerMediaRequest): Promise<Result<ConsumerMediaResult, ConsumerMediaInputError>> {
    const mapped = toConsumerMediaResource(session, operation);
    if (!mapped.ok) return mapped;
    const resource = mapped.value;
    const request: SintRequest = {
      requestId: generateUUIDv7(), timestamp: nowISO8601(), agentId: session.agentId,
      tokenId: session.tokenId as SintRequest["tokenId"], resource, action: operation.operation,
      params: { dataClass: operation.dataClass, recipient: operation.recipient, purpose: operation.purpose, retentionDeadline: operation.retentionDeadline, effectId: operation.effectId },
      executionContext: { deploymentProfile: "home-media-private", bridgeId: "consumer-media", bridgeProtocol: "consumer-media-v1" },
    };
    const decision = await this.gateway.intercept(request);
    if (decision.action === "allow") return ok({ action: "forward", decision, resource });
    if (decision.action === "escalate") {
      return ok({ action: "escalate", decision, resource, requiredTier: decision.escalation?.requiredTier });
    }
    return ok({ action: "deny", decision, resource, denyReason: decision.denial?.reason });
  }
}
