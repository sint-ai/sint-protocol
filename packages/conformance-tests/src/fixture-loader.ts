/**
 * SINT conformance fixture loader.
 *
 * Loads canonical JSON fixtures that external partners can reuse for
 * interoperability certification.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApprovalTier, PolicyDecision } from "@pshkv/core";
import type { OpcUaOperation } from "@pshkv/bridge-opcua";
import type { RouteCandidate } from "@pshkv/bridge-economy";

const ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(ROOT, "../fixtures");

type DecisionAction = PolicyDecision["action"];
type PhysicalAiDecisionAction = DecisionAction | "rollback";

export interface TokenFixture {
  readonly resource: string;
  readonly actions: readonly string[];
}

export interface RequestTemplate {
  readonly params?: Record<string, unknown>;
  readonly physicalContext?: {
    readonly humanDetected?: boolean;
    readonly currentForceNewtons?: number;
    readonly currentVelocityMps?: number;
    readonly currentPosition?: { x: number; y: number; z: number };
  };
  readonly recentActions?: readonly string[];
}

export interface WarehouseMoveEquivalenceFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly tokens: {
    readonly ros2: TokenFixture;
    readonly sparkplug: TokenFixture;
    readonly openRmf: TokenFixture;
  };
  readonly requests: {
    readonly ros2: RequestTemplate & {
      readonly resource: string;
      readonly action: string;
    };
    readonly sparkplug: RequestTemplate & {
      readonly topic: string;
      readonly messageType: string;
      readonly expectedResource: string;
      readonly expectedAction: string;
    };
    readonly openRmf: RequestTemplate & {
      readonly fleetName: string;
      readonly operation: string;
      readonly expectedResource: string;
      readonly expectedAction: string;
    };
  };
  readonly expected: {
    readonly assignedTier: ApprovalTier;
    readonly decisionAction: DecisionAction;
  };
}

export interface OpcUaSafetyControlFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly token: TokenFixture;
  readonly endpoint: string;
  readonly cases: readonly Array<{
    readonly name: string;
    readonly operation: OpcUaOperation;
    readonly nodeId: string;
    readonly expectedResource: string;
    readonly expectedAction: string;
    readonly expected: {
      readonly assignedTier: ApprovalTier;
      readonly decisionAction: DecisionAction;
    };
  }>;
}

export interface HardwareSafetyHandshakeFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly token: TokenFixture;
  readonly cases: readonly Array<{
    readonly name: string;
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly params?: Record<string, unknown>;
      readonly executionContext?: Record<string, unknown>;
    };
    readonly expected: {
      readonly decisionAction: DecisionAction;
      readonly assignedTier?: ApprovalTier;
      readonly policyViolated?: string;
      readonly expectedEvidenceEvent?: string;
    };
  }>;
}

export interface PhysicalAiRuntimeSafetyFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly profile: {
    readonly transport: "ros2/sros2";
    readonly actionBoundary: "pre-actuation";
    readonly decisionVocabulary: readonly PhysicalAiDecisionAction[];
    readonly transportOutcomes: readonly Array<
      | "forwarded"
      | "held_for_review"
      | "publish_rejected"
      | "discovery_rejected"
      | "execution_rolled_back"
    >;
    readonly evidenceRequirements: {
      readonly decisionRefRequired: boolean;
      readonly actionIntentRefRequired: boolean;
      readonly hashChainRequired: boolean;
      readonly receiptRequiredForNegativeOutcomes: boolean;
      readonly authorityPointer: {
        readonly field: "delegation_ref";
        readonly form: "opaque_content_addressed";
        readonly nullable: boolean;
      };
      readonly actionPointer: {
        readonly field: "action_ref";
        readonly form: "deterministic_public_derivation";
      };
    };
  };
  readonly defaultToken: TokenFixture & {
    readonly constraints?: {
      readonly maxVelocityMps?: number;
      readonly maxForceNewtons?: number;
    };
  };
  readonly cases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly tokenOverride?: TokenFixture & {
      readonly constraints?: {
        readonly maxVelocityMps?: number;
        readonly maxForceNewtons?: number;
      };
    };
    readonly request?: RequestTemplate & {
      readonly resource: string;
      readonly action: string;
      readonly executionContext?: Record<string, unknown>;
    };
    readonly transportCheck?: {
      readonly enclave: {
        readonly enclavePath: string;
        readonly domainId: number;
        readonly allowPublish: readonly string[];
        readonly allowSubscribe: readonly string[];
        readonly denyPublish: readonly string[];
        readonly denySubscribe: readonly string[];
        readonly governanceEnforced: boolean;
      };
      readonly topicName: string;
      readonly operation: "publish" | "subscribe";
    };
    readonly expected: {
      readonly decisionAction: PhysicalAiDecisionAction;
      readonly assignedTier?: ApprovalTier;
      readonly policyViolated?: string;
      readonly transportOutcome:
        | "forwarded"
        | "held_for_review"
        | "publish_rejected"
        | "discovery_rejected"
        | "execution_rolled_back";
      readonly transportDecision?: "allow" | "deny" | "not-covered";
      readonly evidenceEventType?: string;
      readonly evidence?: {
        readonly decisionRefRequired?: boolean;
        readonly actionIntentRefRequired?: boolean;
        readonly hashChainRequired?: boolean;
        readonly receiptRequired?: boolean;
        readonly providerSpecificReceiptAllowed?: boolean;
        readonly authorityPointerRequired?: boolean;
        readonly actionPointerRequired?: boolean;
        readonly rollbackTargetRefRequired?: boolean;
        readonly samplePointers?: {
          readonly delegation_ref: string | null;
          readonly action_ref: string;
        };
      };
    };
  }>;
}

export interface A2ASkillCapabilityEnforcementFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly agentCard: {
    readonly url: string;
    readonly name: string;
    readonly version: string;
    readonly skills: readonly Array<{
      readonly id: string;
      readonly name: string;
      readonly tags?: readonly string[];
    }>;
  };
  readonly tokens: Record<string, TokenFixture>;
  readonly cases: readonly Array<{
    readonly name: string;
    readonly tokenRef: string;
    readonly agentRef: "primary" | "secondary";
    readonly preRevoked?: boolean;
    readonly request: {
      readonly id: string;
      readonly sessionId?: string;
      readonly skillId?: string;
      readonly message: {
        readonly role: "user" | "agent";
        readonly parts: readonly Array<
          | { readonly type: "text"; readonly text: string }
          | { readonly type: "data"; readonly data: Record<string, unknown> }
        >;
      };
      readonly metadata?: Record<string, unknown>;
    };
    readonly expected: {
      readonly interceptAction: "forward" | "deny" | "escalate";
      readonly assignedTier?: ApprovalTier;
      readonly policyViolated?: string;
      readonly expectedEvidenceEvent?: string;
    };
  }>;
}

export interface WellKnownDiscoveryFixture {
  readonly name: string;
  readonly version: string;
  readonly boundary: string;
  readonly identityMethods: readonly string[];
  readonly attestationModes: readonly string[];
  readonly deploymentProfiles: readonly Record<string, unknown>[];
  readonly supportedBridges: readonly Record<string, unknown>[];
  readonly schemaCatalog: readonly Array<{ name: string; path: string }>;
  readonly complianceCrosswalk?: {
    readonly path: string;
    readonly frameworks: readonly string[];
  };
  readonly openapi: string;
}

export interface TierComplianceCrosswalkFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly frameworks: readonly string[];
  readonly tiers: readonly Array<{
    readonly tier: ApprovalTier;
    readonly consequenceClass: "monitoring" | "bounded-write" | "physical-state-change" | "irreversible-commit";
    readonly requiredReferences: readonly string[];
  }>;
}

export interface PersistenceAdapterCertificationFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly ledgerRows: readonly Record<string, unknown>[];
  readonly revocationRow: Record<string, unknown>;
  readonly rateLimitRow: Record<string, unknown>;
}

export interface SupplyChainVerificationFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly token: TokenFixture & {
    readonly modelConstraints?: {
      readonly allowedModelIds?: readonly string[];
      readonly modelFingerprintHash?: string;
    };
  };
  readonly cases: readonly Array<{
    readonly name: string;
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly params?: Record<string, unknown>;
      readonly executionContext?: {
        readonly model?: {
          readonly modelId?: string;
          readonly modelFingerprintHash?: string;
        };
      };
    };
    readonly expected: {
      readonly decisionAction: DecisionAction;
      readonly policyViolated?: string;
      readonly warningEvent?: string;
      readonly severity?: "low" | "medium" | "high";
    };
  }>;
}

export interface MqttGatewaySessionFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly broker: string;
  readonly token: TokenFixture;
  readonly cases: readonly Array<{
    readonly name: string;
    readonly mode: "publish" | "subscribe";
    readonly topic: string;
    readonly payload?: string;
    readonly expected: {
      readonly assignedTier: ApprovalTier;
      readonly gatewayAction: DecisionAction;
      readonly forwarded: boolean;
    };
  }>;
}

export interface VerifiableComputeCriticalActionsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly token: TokenFixture & {
    readonly verifiableComputeRequirements?: {
      readonly requireForTiers?: readonly ApprovalTier[];
      readonly allowedProofTypes?: readonly string[];
      readonly verifierRefs?: readonly string[];
      readonly maxProofAgeMs?: number;
      readonly requirePublicInputsHash?: boolean;
    };
  };
  readonly cases: readonly Array<{
    readonly name: string;
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly params?: Record<string, unknown>;
      readonly executionContext?: Record<string, unknown>;
    };
    readonly expected: {
      readonly decisionAction: DecisionAction;
      readonly assignedTier?: ApprovalTier;
      readonly policyViolated?: string;
    };
  }>;
}

export interface EconomyRoutingFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly cases: readonly Array<{
    readonly name: string;
    readonly input: {
      readonly request: {
        readonly requestId: string;
        readonly resource: string;
        readonly action: string;
        readonly params: Record<string, unknown>;
      };
      readonly candidates: readonly RouteCandidate[];
      readonly budgetRemainingTokens?: number;
      readonly maxLatencyMs?: number;
      readonly latencyWeight?: number;
    };
    readonly x402Quotes?: readonly Array<{
      readonly routeId: string;
      readonly endpoint: string;
      readonly priceUsd: number;
      readonly currency: "USD";
    }>;
    readonly expected: {
      readonly routeId: string;
      readonly viaX402: boolean;
    };
  }>;
}

export interface AutogenCapabilityTrustFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly token: TokenFixture;
  readonly equivalenceScenarios: readonly Array<{
    readonly name: string;
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly params?: Record<string, unknown>;
    };
    readonly trustSignal: "unrestricted" | "low_risk" | "medium_risk" | "high_risk" | "blocked";
    readonly expected: {
      readonly assignedTier: ApprovalTier;
      readonly decisionAction: DecisionAction;
      readonly expectedEvidenceEvent?: string;
    };
  }>;
  readonly trustMatrix: readonly Array<{
    readonly name: string;
    readonly trustSignal: "unrestricted" | "low_risk" | "medium_risk" | "high_risk" | "blocked";
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly params?: Record<string, unknown>;
    };
    readonly expected: {
      readonly assignedTier: ApprovalTier;
      readonly decisionAction: DecisionAction;
      readonly policyViolated?: string;
      readonly expectedEvidenceEvent?: string;
    };
  }>;
  readonly edgeFailClosedScenario: {
    readonly name: string;
    readonly trustSignal: "unrestricted" | "low_risk" | "medium_risk" | "high_risk" | "blocked";
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly params?: Record<string, unknown>;
    };
    readonly expected: {
      readonly assignedTier: ApprovalTier;
      readonly decisionAction: DecisionAction;
      readonly policyViolated?: string;
    };
  };
}

export interface AgentSkillDelegatedAuthorityFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly tokenTemplate: TokenFixture & {
    readonly delegationDepth: number;
    readonly revocable?: boolean;
  };
  readonly cases: readonly Array<{
    readonly name: string;
    readonly tokenOverrides?: {
      readonly resource?: string;
      readonly actions?: readonly string[];
      readonly expiresAt?: string;
      readonly attestationRequirements?: {
        readonly minAttestationGrade?: 0 | 1 | 2 | 3;
        readonly allowedTeeBackends?: readonly Array<"intel-sgx" | "arm-trustzone" | "amd-sev" | "tpm2" | "none">;
        readonly requireForTiers?: readonly ApprovalTier[];
      };
    };
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly params?: Record<string, unknown>;
      readonly executionContext?: Record<string, unknown>;
    };
    readonly lifecycle?: {
      readonly revokeBeforeIntercept?: {
        readonly reason: string;
        readonly revokedBy: string;
      };
      readonly expireBeforeInterceptMs?: number;
    };
    readonly expected: {
      readonly decisionAction: DecisionAction;
      readonly assignedTier?: ApprovalTier;
      readonly policyViolated?: string;
    };
  }>;
}

export interface ActionRefExplainabilityFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly profile: {
    readonly hashAlgorithm: "sha256";
    readonly identityTuple: readonly ["agentId", "resource", "action", "scope", "timestamp"];
  };
  readonly cases: readonly Array<{
    readonly name: string;
    readonly identity: {
      readonly engineA: {
        readonly agentId: string;
        readonly resource: string;
        readonly action: string;
        readonly scope: string;
        readonly timestamp: string;
      };
      readonly engineB: {
        readonly agentId: string;
        readonly resource: string;
        readonly action: string;
        readonly scope: string;
        readonly timestamp: string;
      };
    };
    readonly decisionContext?: {
      readonly engineA: {
        readonly policyProfile?: string;
        readonly ruleIds?: readonly string[];
        readonly constraintDigest?: string;
        readonly decisionTime?: string;
        readonly verdict: "allow" | "deny" | "escalate" | "transform";
      };
      readonly engineB: {
        readonly policyProfile?: string;
        readonly ruleIds?: readonly string[];
        readonly constraintDigest?: string;
        readonly decisionTime?: string;
        readonly verdict: "allow" | "deny" | "escalate" | "transform";
      };
    };
    readonly artifactLinkage?: {
      readonly decisionArtifact: {
        readonly actionRef: string;
        readonly compoundDigest: string;
      };
      readonly executionReceipt: {
        readonly actionRef: string;
        readonly decisionArtifactDigest: string;
      };
    };
    readonly expected: {
      readonly sameActionRef: boolean;
      readonly explainabilityComparable?: boolean;
      readonly linkageValid?: boolean;
    };
  }>;
}

export interface PaymentGovernanceFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly defaults: {
    readonly dailyBudgetTokens: number;
    readonly rollingWindowMs: number;
    readonly rollingWindowCapTokens: number;
    readonly approvedRecipients: readonly string[];
  };
  readonly cases: readonly Array<{
    readonly name: string;
    readonly setup?: {
      readonly usedTodayTokens?: number;
      readonly priorTxsInWindow?: readonly Array<{
        readonly tokens: number;
        readonly atOffsetMs: number;
      }>;
      readonly reserveOnlyTxIds?: readonly string[];
      readonly usedReceiptIds?: readonly string[];
    };
    readonly payment: {
      readonly txId: string;
      readonly agentId: string;
      readonly recipient: string;
      readonly tokens: number;
      readonly receiptId?: string;
    };
    readonly flow: {
      readonly reserve: boolean;
      readonly commit: boolean;
    };
    readonly expected: {
      readonly allowed: boolean;
      readonly reason:
        | "ALLOW"
        | "BUDGET_EXCEEDED"
        | "ROLLING_WINDOW_EXCEEDED"
        | "RECIPIENT_NOT_ALLOWLISTED"
        | "RECEIPT_REPLAY"
        | "SETTLEMENT_MISMATCH";
    };
  }>;
}

function loadFixture<T>(relativePath: string): T {
  const path = resolve(FIXTURE_ROOT, relativePath);
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

export function loadWarehouseMoveEquivalenceFixture(): WarehouseMoveEquivalenceFixture {
  return loadFixture<WarehouseMoveEquivalenceFixture>(
    "industrial/warehouse-move-equivalence.v1.json",
  );
}

export function loadOpcUaSafetyControlFixture(): OpcUaSafetyControlFixture {
  return loadFixture<OpcUaSafetyControlFixture>(
    "industrial/opcua-safety-control.v1.json",
  );
}

export function loadHardwareSafetyHandshakeFixture(): HardwareSafetyHandshakeFixture {
  return loadFixture<HardwareSafetyHandshakeFixture>(
    "industrial/hardware-safety-handshake.v1.json",
  );
}

export function loadPhysicalAiRuntimeSafetyFixture(): PhysicalAiRuntimeSafetyFixture {
  return loadFixture<PhysicalAiRuntimeSafetyFixture>(
    "physical-ai/runtime-safety-fixtures.v0.1.json",
  );
}

export function loadA2ASkillCapabilityEnforcementFixture(): A2ASkillCapabilityEnforcementFixture {
  return loadFixture<A2ASkillCapabilityEnforcementFixture>(
    "industrial/a2a-skill-capability-enforcement.v1.json",
  );
}

export function loadWellKnownDiscoveryFixture(): WellKnownDiscoveryFixture {
  return loadFixture<WellKnownDiscoveryFixture>(
    "protocol/well-known-sint.v0.2.example.json",
  );
}

export function loadTierComplianceCrosswalkFixture(): TierComplianceCrosswalkFixture {
  return loadFixture<TierComplianceCrosswalkFixture>(
    "protocol/tier-compliance-crosswalk.v1.json",
  );
}

export function loadPersistenceAdapterCertificationFixture(): PersistenceAdapterCertificationFixture {
  return loadFixture<PersistenceAdapterCertificationFixture>(
    "persistence/postgres-adapter-cert.v1.json",
  );
}

export function loadSupplyChainVerificationFixture(): SupplyChainVerificationFixture {
  return loadFixture<SupplyChainVerificationFixture>(
    "security/supply-chain-verification.v1.json",
  );
}

export function loadMqttGatewaySessionFixture(): MqttGatewaySessionFixture {
  return loadFixture<MqttGatewaySessionFixture>(
    "iot/mqtt-gateway-session.v1.json",
  );
}

export function loadVerifiableComputeCriticalActionsFixture(): VerifiableComputeCriticalActionsFixture {
  return loadFixture<VerifiableComputeCriticalActionsFixture>(
    "security/verifiable-compute-critical-actions.v1.json",
  );
}

export function loadEconomyRoutingFixture(): EconomyRoutingFixture {
  return loadFixture<EconomyRoutingFixture>(
    "economy/cost-aware-routing.v1.json",
  );
}

export function loadAutogenCapabilityTrustFixture(): AutogenCapabilityTrustFixture {
  return loadFixture<AutogenCapabilityTrustFixture>(
    "interop/autogen-capability-trust.v1.json",
  );
}

export function loadAgentSkillDelegatedAuthorityFixture(): AgentSkillDelegatedAuthorityFixture {
  return loadFixture<AgentSkillDelegatedAuthorityFixture>(
    "interop/agentskill-delegated-authority.v1.json",
  );
}

export function loadActionRefExplainabilityFixture(): ActionRefExplainabilityFixture {
  return loadFixture<ActionRefExplainabilityFixture>(
    "interop/action-ref-explainability.v1.json",
  );
}

export function loadPaymentGovernanceFixture(): PaymentGovernanceFixture {
  return loadFixture<PaymentGovernanceFixture>(
    "economy/payment-governance.v1.json",
  );
}

export interface APSSINTHandshakeCase {
  readonly name: string;
  readonly scenario: "A" | "B" | "C";
  readonly description: string;
  readonly handshake: {
    readonly subject: string;
    readonly delegation_root: string;
    readonly capability_token: string;
    readonly action_ref: string;
    readonly receipt_uri: string | null;
  };
  readonly token: {
    readonly resource: string;
    readonly actions: readonly string[];
    readonly delegationChain?: {
      readonly parentTokenId: string | null;
      readonly depth: number;
      readonly attenuated: boolean;
    };
    readonly revoked?: boolean;
    readonly revocationReason?: string;
  };
  readonly parentToken?: {
    readonly resource: string;
    readonly actions: readonly string[];
    readonly delegationChain?: {
      readonly parentTokenId: string | null;
      readonly depth: number;
      readonly attenuated: boolean;
    };
    readonly revoked?: boolean;
    readonly revocationReason?: string;
  };
  readonly request: {
    readonly resource: string;
    readonly action: string;
    readonly params?: Record<string, unknown>;
  };
  readonly expected: {
    readonly decisionAction: DecisionAction;
    readonly assignedTier?: ApprovalTier;
    readonly policyViolated?: string;
    readonly mcpInterceptorAction?: "forward" | "deny" | "escalate" | null;
    readonly ledgerEventEmitted?: string;
    readonly note?: string;
  };
}

export interface APSSINTHandshakeFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly interopProtocol: string;
  readonly cases: readonly APSSINTHandshakeCase[];
}

export function loadAPSSINTHandshakeFixture(): APSSINTHandshakeFixture {
  return loadFixture<APSSINTHandshakeFixture>(
    "interop/aps-sint-handshake.v1.json",
  );
}

export interface PostQuantumCryptoAgilityFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly profiles: readonly Array<{
    readonly cryptoProfile:
      | "classic-ed25519"
      | "hybrid-ed25519-mldsa65"
      | "pq-mldsa65"
      | "pq-slh-dsa";
    readonly signatureFamilies: readonly string[];
    readonly expectedValidation: "allow" | "deny";
    readonly expectedError?: "UNSUPPORTED_CRYPTO_PROFILE";
  }>;
  readonly requirements: {
    readonly signingPayloadBindsCryptoProfile: boolean;
    readonly unsupportedMandatoryProfilesFailClosed: boolean;
    readonly postQuantumSignatureMetadataPreserved: boolean;
    readonly preferredFirstProductionProfile: "hybrid-ed25519-mldsa65";
  };
}

export function loadPostQuantumCryptoAgilityFixture(): PostQuantumCryptoAgilityFixture {
  return loadFixture<PostQuantumCryptoAgilityFixture>(
    "security/post-quantum-crypto-agility.v1.json",
  );
}

export interface HumanoidProfileFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly resourcePrefix: string;
  readonly requirements: {
    readonly singleGatewayChokePoint: boolean;
    readonly ros2OpenRmfEquivalentTiering: boolean;
    readonly handoffRequiresReceipt: boolean;
    readonly estopIsT3Override: boolean;
  };
  readonly intents: readonly Array<{
    readonly name: string;
    readonly humanoidResource: string;
    readonly humanoidAction: string;
    readonly expectedTier: ApprovalTier;
    readonly expectedDecisionAction: DecisionAction;
    readonly requiresReceipt?: boolean;
    readonly physicalContext?: {
      readonly currentVelocityMps?: number;
      readonly currentForceNewtons?: number;
      readonly humanDetected?: boolean;
    };
    readonly bridgeMappings?: {
      readonly ros2?: {
        readonly kind: "topic" | "service" | "action";
        readonly name: string;
        readonly action: string;
        readonly expectedTier: ApprovalTier;
      };
      readonly openRmf?: {
        readonly fleetName: string;
        readonly robotName?: string;
        readonly operation:
          | "fleet.status"
          | "robot.status"
          | "task.dispatch"
          | "task.cancel"
          | "traffic.reserve"
          | "door.command"
          | "lift.command"
          | "emergency.stop"
          | "emergency.release";
        readonly expectedAction: "observe" | "prepare" | "call" | "override";
        readonly expectedTier: ApprovalTier;
      };
    };
  }>;
}

export function loadHumanoidProfileFixture(): HumanoidProfileFixture {
  return loadFixture<HumanoidProfileFixture>(
    "physical-ai/humanoid-profile.v1.json",
  );
}
