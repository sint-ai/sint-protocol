import type {
  ApprovalTier,
  Ed25519PublicKey,
  Ed25519Signature,
  ISO8601,
  Result,
  SHA256,
  SintCapabilityToken,
  UUIDv7,
} from "@pshkv/core";
import type { PhysicalActionContext } from "@pshkv/gate-capability-tokens";

export type EffectParameterType = "string" | "number" | "integer" | "boolean";

export interface EffectParameterContract {
  readonly type: EffectParameterType;
  readonly required?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly enum?: readonly (string | number | boolean)[];
}

export interface EffectContract {
  readonly effectId: string;
  readonly resource: string;
  readonly action: string;
  readonly minimumTier: ApprovalTier;
  readonly parameters: Readonly<Record<string, EffectParameterContract>>;
  readonly allowAdditionalParameters?: boolean;
  readonly maxDurationMs: number;
  readonly maxOutputBytes: number;
  readonly secretPatterns?: readonly string[];
  readonly physicalBindings?: {
    readonly velocityParameter?: string;
    readonly forceParameter?: string;
    readonly positionXParameter?: string;
    readonly positionYParameter?: string;
    readonly humanPresenceParameter?: string;
  };
  readonly effectClass:
    | "observe"
    | "compute"
    | "physical-motion"
    | "physical-contact"
    | "configuration"
    | "economic-commit";
}

export interface EffectPackPayload {
  readonly schemaVersion: "sint-effect-pack/1";
  readonly packId: string;
  readonly version: string;
  readonly issuedAt: ISO8601;
  readonly expiresAt?: ISO8601;
  readonly issuer: Ed25519PublicKey;
  readonly effects: readonly EffectContract[];
}

export interface SignedEffectPack extends EffectPackPayload {
  readonly digest: SHA256;
  readonly signature: Ed25519Signature;
}

export interface DispatchAuthorization {
  readonly decision: "allow" | "transform";
  readonly assignedTier: ApprovalTier;
  readonly policyEventHash: SHA256;
  readonly approvalEventHash?: SHA256;
}

export interface DispatchEnvelopePayload {
  readonly schemaVersion: "sint-dispatch/1";
  readonly dispatchId: UUIDv7;
  readonly requestId: UUIDv7;
  readonly actionRef: string;
  readonly runnerId: string;
  readonly packId: string;
  readonly packDigest: SHA256;
  readonly effectId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly capabilityToken: SintCapabilityToken;
  readonly authorization: DispatchAuthorization;
  readonly physicalContext?: PhysicalActionContext;
  readonly issuedAt: ISO8601;
  readonly expiresAt: ISO8601;
  readonly nonce: string;
  readonly signer: Ed25519PublicKey;
}

export interface SignedDispatchEnvelope extends DispatchEnvelopePayload {
  readonly signature: Ed25519Signature;
}

export interface LocalAdmissionPolicy {
  readonly allowedPackDigests?: readonly SHA256[];
  readonly deniedEffectIds?: readonly string[];
  readonly allowedEffectIds?: readonly string[];
  readonly trustedPackIssuers: readonly Ed25519PublicKey[];
  readonly trustedDispatchSigners: readonly Ed25519PublicKey[];
  readonly trustedCapabilityIssuers?: readonly Ed25519PublicKey[];
  readonly maximumTier?: ApprovalTier;
  readonly requireApprovalEvidenceFor?: readonly ApprovalTier[];
}

export interface EffectExecutionRequest {
  readonly dispatchId: UUIDv7;
  readonly actionRef: string;
  readonly effect: EffectContract;
  readonly params: Readonly<Record<string, unknown>>;
  readonly capabilityToken: SintCapabilityToken;
}

export interface EffectExecutionOutput {
  readonly status: "completed" | "failed" | "cancelled";
  readonly output?: string;
  readonly code?: string;
  readonly metrics?: Readonly<Record<string, number>>;
}

export type EffectExecutor = (
  request: EffectExecutionRequest,
) =>
  | Result<EffectExecutionOutput, string>
  | Promise<Result<EffectExecutionOutput, string>>;

export type EdgeRunDenialCode =
  | "INVALID_PACK"
  | "UNTRUSTED_PACK"
  | "PACK_EXPIRED"
  | "INVALID_DISPATCH"
  | "UNTRUSTED_DISPATCHER"
  | "DISPATCH_EXPIRED"
  | "WRONG_RUNNER"
  | "REPLAY_DETECTED"
  | "LOCAL_POLICY_DENIED"
  | "CAPABILITY_REJECTED"
  | "PARAMETER_REJECTED"
  | "APPROVAL_EVIDENCE_REQUIRED"
  | "EXECUTION_TIMEOUT"
  | "EXECUTOR_FAILED";

export interface EdgeRunDenial {
  readonly code: EdgeRunDenialCode;
  readonly reason: string;
}

export interface EdgeRunReceipt {
  readonly dispatchId: UUIDv7;
  readonly actionRef: string;
  readonly runnerId: string;
  readonly packDigest: SHA256;
  readonly effectId: string;
  readonly status: EffectExecutionOutput["status"];
  readonly startedAt: ISO8601;
  readonly completedAt: ISO8601;
  readonly output?: string;
  readonly outputTruncated: boolean;
  readonly redactionCount: number;
  readonly code?: string;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly journalHead: SHA256;
}

export interface EdgeJournalEntry {
  readonly sequence: number;
  readonly timestamp: ISO8601;
  readonly event:
    | "dispatch.accepted"
    | "dispatch.denied"
    | "effect.started"
    | "effect.completed"
    | "effect.failed"
    | "effect.cancelled";
  readonly dispatchId: UUIDv7;
  readonly actionRef: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly previousHash: SHA256;
  readonly hash: SHA256;
}
