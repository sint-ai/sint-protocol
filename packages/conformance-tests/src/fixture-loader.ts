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
import type { RmfOperation } from "@pshkv/bridge-open-rmf";

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

export interface AgentCommerceGovernanceFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly profile: {
    readonly resources: readonly string[];
    readonly actions: readonly string[];
    readonly taskModes: readonly string[];
    readonly decisionReasons: readonly AgentCommerceDecisionReason[];
    readonly evidenceRequiredFor: readonly string[];
  };
  readonly defaults: {
    readonly referenceTime: string;
    readonly minReputationScore: number;
    readonly highValueApprovalThresholdUsdc: number;
    readonly maxX402SessionCapUsdc: number;
    readonly maxPermitExpiryMinutes: number;
    readonly allowedRecipients: readonly string[];
    readonly registeredAgents: readonly string[];
    readonly reputationByAgent: Record<string, number>;
    readonly usedSettlementReceiptIds: readonly string[];
  };
  readonly cases: readonly AgentCommerceGovernanceCase[];
}

export type AgentCommerceDecision = "allow" | "deny" | "escalate";

export type AgentCommerceDecisionReason =
  | "ALLOW"
  | "AGENT_IDENTITY_REQUIRED"
  | "SCOPE_NOT_AUTHORIZED"
  | "REPUTATION_BELOW_THRESHOLD"
  | "VALUE_REQUIRES_APPROVAL"
  | "STATE_TRANSITION_INVALID"
  | "BID_NOT_COMPETITIVE"
  | "PROOF_REQUIRED"
  | "X402_CAP_EXCEEDED"
  | "X402_PERMIT_EXPIRED"
  | "RECIPIENT_NOT_ALLOWLISTED"
  | "SETTLEMENT_STATE_INVALID"
  | "RECEIPT_REPLAY";

export interface AgentCommerceGovernanceCase {
  readonly name: string;
  readonly principal: string;
  readonly capability: {
    readonly resources: readonly string[];
    readonly actions: readonly string[];
  };
  readonly request: {
    readonly resource: string;
    readonly action: string;
    readonly task?: {
      readonly id: string;
      readonly mode: "bounty" | "claim" | "pitch" | "benchmark" | "auction";
      readonly status:
        | "draft"
        | "open"
        | "claimed"
        | "worker_selected"
        | "pending_approval"
        | "accepted"
        | "settled";
      readonly rewardUsdc: number;
      readonly recipient?: string;
      readonly stakeRequiredUsdc?: number;
      readonly auctionType?: "english" | "reverse_english" | "dutch" | "reverse_dutch";
      readonly maxPriceUsdc?: number;
      readonly currentLowestBidUsdc?: number;
      readonly selectedWorker?: string;
      readonly metricDescription?: string;
      readonly metricTarget?: string;
    };
    readonly bid?: {
      readonly priceUsdc: number;
    };
    readonly proof?: {
      readonly type: string;
      readonly metricName?: string;
      readonly metricValue?: number;
      readonly digest?: string;
    };
    readonly x402?: {
      readonly sessionId: string;
      readonly recipient: string;
      readonly permitCapUsdc: number;
      readonly expiresAt: string;
    };
    readonly settlement?: {
      readonly recipient: string;
      readonly receiptId: string;
    };
  };
  readonly expected: {
    readonly decision: AgentCommerceDecision;
    readonly reason: AgentCommerceDecisionReason;
    readonly requiredTier?: string;
    readonly nextStatus?: string;
    readonly evidenceRequired: boolean;
  };
}

export interface PhysicalWorkMarketFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly profile: {
    readonly resources: readonly string[];
    readonly actions: readonly string[];
    readonly taskStatuses: readonly PhysicalWorkTaskStatus[];
    readonly decisionReasons: readonly PhysicalWorkDecisionReason[];
    readonly evidenceRequiredFor: readonly string[];
  };
  readonly defaults: {
    readonly referenceTime: string;
    readonly highValueApprovalThresholdUsdc: number;
    readonly minStakeBySubnetUsdc: Record<string, number>;
    readonly supportedSubnets: readonly string[];
    readonly registeredIdentities: readonly string[];
    readonly requiredSensorsBySubnet: Record<string, readonly string[]>;
    readonly minSimulationSafetyScore: number;
    readonly minVerifierSafetyScore: number;
    readonly validatorQuorum: number;
    readonly usedSettlementReceiptIds: readonly string[];
  };
  readonly cases: readonly PhysicalWorkMarketCase[];
}

export type PhysicalWorkDecision = "allow" | "deny" | "escalate";

export type PhysicalWorkDecisionReason =
  | "ALLOW"
  | "SCOPE_NOT_AUTHORIZED"
  | "IDENTITY_REQUIRED"
  | "SUBNET_NOT_SUPPORTED"
  | "STAKE_BELOW_MINIMUM"
  | "VALUE_REQUIRES_APPROVAL"
  | "STATE_TRANSITION_INVALID"
  | "SIM_PROOF_REQUIRED"
  | "POPW_BUNDLE_REQUIRED"
  | "POPW_BUNDLE_INCOMPLETE"
  | "VALIDATOR_QUORUM_NOT_MET"
  | "VERIFIER_SAFETY_BELOW_THRESHOLD"
  | "DEADLINE_EXPIRED"
  | "SETTLEMENT_STATE_INVALID"
  | "RECEIPT_REPLAY";

export type PhysicalWorkTaskStatus =
  | "draft"
  | "open"
  | "bid_submitted"
  | "bid_selected"
  | "sim_passed"
  | "executing"
  | "proof_submitted"
  | "verified"
  | "settled"
  | "failed";

export interface PhysicalWorkMarketCase {
  readonly name: string;
  readonly principal: string;
  readonly capability: {
    readonly resources: readonly string[];
    readonly actions: readonly string[];
  };
  readonly request: {
    readonly resource: string;
    readonly action: string;
    readonly task?: {
      readonly id: string;
      readonly subnet: string;
      readonly status: PhysicalWorkTaskStatus;
      readonly rewardUsdc: number;
      readonly deadline: string;
      readonly requiredTier: "T1_PREPARE" | "T2_ACT" | "T3_COMMIT";
      readonly selectedRobot?: string;
    };
    readonly bid?: {
      readonly robotId: string;
      readonly stakeUsdc: number;
      readonly etaSeconds: number;
    };
    readonly simulationProof?: {
      readonly digest?: string;
      readonly deterministicReplay?: boolean;
      readonly safetyScore?: number;
    };
    readonly popwBundle?: {
      readonly taskId: string;
      readonly actionRef: string;
      readonly robotId: string;
      readonly deadline: string;
      readonly sensors: readonly string[];
      readonly mediaHash?: string;
      readonly bundleHash?: string;
    };
    readonly validatorAttestations?: readonly Array<{
      readonly validatorId: string;
      readonly verdict: "success" | "failure" | "inconclusive";
      readonly safety: number;
      readonly finalPct: number;
      readonly evidenceHash: string;
    }>;
    readonly settlement?: {
      readonly receiptId: string;
      readonly recipient: string;
      readonly amountUsdc: number;
    };
  };
  readonly expected: {
    readonly decision: PhysicalWorkDecision;
    readonly reason: PhysicalWorkDecisionReason;
    readonly requiredTier?: string;
    readonly nextStatus?: PhysicalWorkTaskStatus;
    readonly evidenceRequired: boolean;
  };
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

export function loadAgentCommerceGovernanceFixture(): AgentCommerceGovernanceFixture {
  return loadFixture<AgentCommerceGovernanceFixture>(
    "economy/agent-commerce-governance.v1.json",
  );
}

export function loadPhysicalWorkMarketFixture(): PhysicalWorkMarketFixture {
  return loadFixture<PhysicalWorkMarketFixture>(
    "physical-ai/physical-work-market.v1.json",
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

export interface HumanoidWarehousePilotFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly pilot: {
    readonly siteId: string;
    readonly shiftId: string;
    readonly fleetId: string;
    readonly robotIds: readonly string[];
    readonly deploymentProfile: "warehouse-amr";
    readonly targetRobotCount: {
      readonly min: number;
      readonly max: number;
    };
  };
  readonly exportSchema: {
    readonly format: "json-lines";
    readonly requiredFields: readonly string[];
    readonly optionalFields: readonly string[];
  };
  readonly successCriteria: {
    readonly chainVerificationRequired: boolean;
    readonly allT2T3HaveApprovalOrDenialEvidence: boolean;
    readonly handoffRequiresReceipt: boolean;
    readonly estopRequiresRollbackOrDenyEvidence: boolean;
    readonly exportAcceptedByExternalReviewer: boolean;
  };
  readonly sampleEvents: readonly Array<{
    readonly name: string;
    readonly robotId: string;
    readonly eventType: string;
    readonly resource: string;
    readonly action: string;
    readonly decision: "allow" | "deny" | "escalate";
    readonly assignedTier: ApprovalTier;
    readonly approvalId?: string;
    readonly operatorId?: string;
    readonly incidentId?: string;
    readonly handoffReceiptId?: string;
    readonly safetyControllerId?: string;
    readonly latencyMs?: number;
    readonly denialPolicy?: string;
    readonly receiptRequired: boolean;
    readonly rollbackTargetRef?: string;
  }>;
}

export function loadHumanoidWarehousePilotFixture(): HumanoidWarehousePilotFixture {
  return loadFixture<HumanoidWarehousePilotFixture>(
    "physical-ai/humanoid-warehouse-pilot.v1.json",
  );
}

export interface HumanoidMultivendorFleetFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly deployment: {
    readonly siteId: string;
    readonly fleetId: string;
    readonly robots: readonly Array<{
      readonly id: string;
      readonly kind: "humanoid" | "amr" | "conveyor";
      readonly vendor: string;
    }>;
    readonly humanZones: readonly string[];
  };
  readonly requirements: {
    readonly handoffRequiresReceipt: boolean;
    readonly sharedZoneConflictFailsClosed: boolean;
    readonly crossBridgeReplayPreservesIntent: boolean;
    readonly crossBridgeReplayPreservesHighConsequenceTier: boolean;
    readonly dashboardQueriesDefinedForThousandRobotAudit: boolean;
  };
  readonly handoffReceiptSchema: {
    readonly requiredFields: readonly string[];
    readonly sample: Record<string, string>;
  };
  readonly sharedZoneClaims: readonly Array<{
    readonly claimId: string;
    readonly robotId: string;
    readonly workspaceId: string;
    readonly resource: string;
    readonly action: "prepare";
    readonly window: {
      readonly start: string;
      readonly end: string;
    };
    readonly expectedDecision: "allow" | "deny";
    readonly expectedTier: ApprovalTier;
    readonly policyViolated?: "FLEET_ZONE_CONFLICT";
  }>;
  readonly crossBridgeReplay: {
    readonly intentId: string;
    readonly semanticIntent: "move_payload_to_packout";
    readonly expectedAssignedTier: ApprovalTier;
    readonly expectedDecisionAction: DecisionAction;
    readonly paths: readonly Array<{
      readonly bridge: "ros2" | "open-rmf" | "opcua" | "sparkplug";
      readonly resource: string;
      readonly action: "publish" | "call";
      readonly mapperInput: Record<string, string>;
    }>;
  };
  readonly dashboardAuditQueries: readonly Array<{
    readonly name: string;
    readonly purpose: string;
    readonly requiredFilters: readonly string[];
  }>;
  readonly successCriteria: {
    readonly handoffWithoutReceiptRejected: boolean;
    readonly conflictingWorkspaceClaimsDenied: boolean;
    readonly crossBridgeReplayAllEscalates: boolean;
    readonly dashboardQueriesHaveBoundedFilters: boolean;
  };
}

export function loadHumanoidMultivendorFleetFixture(): HumanoidMultivendorFleetFixture {
  return loadFixture<HumanoidMultivendorFleetFixture>(
    "physical-ai/humanoid-multivendor-fleet.v1.json",
  );
}

export interface OpenRmfHandoffPolicyReceiptsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scope: {
    readonly bridge: "open-rmf";
    readonly boundary: "fleet handoff and facility workflow";
    readonly goal: string;
    readonly nonGoal: string;
  };
  readonly requirements: {
    readonly handoffRequiresReceipt: boolean;
    readonly negativeOutcomesCarryReceipt: boolean;
    readonly facilityCommandsRequireReview: boolean;
    readonly emergencyOverridesRemainAuditable: boolean;
  };
  readonly deployment: {
    readonly siteId: string;
    readonly sourceFleet: string;
    readonly targetFleet: string;
    readonly sourceRobotId: string;
    readonly targetRobotId: string;
    readonly workspaceId: string;
    readonly payloadRef: string;
  };
  readonly receiptSchema: {
    readonly requiredFields: readonly string[];
    readonly sample: Record<string, string>;
  };
  readonly cases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly operation: RmfOperation;
    readonly fleetName?: string;
    readonly robotName?: string;
    readonly resourceKind?: "door" | "lift" | "zone";
    readonly resourceId?: string;
    readonly expectedResource: string;
    readonly expectedAction: "observe" | "prepare" | "call" | "override";
    readonly expectedDecision: DecisionAction;
    readonly expectedTier: ApprovalTier;
    readonly receiptRequired: boolean;
    readonly receiptPresent?: boolean;
    readonly policyViolated?: "HANDOFF_RECEIPT_REQUIRED";
    readonly evidenceEventType?: "rmf.emergency.stop";
  }>;
  readonly successCriteria: {
    readonly allCasesHaveReceipts: boolean;
    readonly dispatchHandoffEscalates: boolean;
    readonly handoffWithoutReceiptDenied: boolean;
    readonly facilityCommandIsHighConsequence: boolean;
    readonly emergencyStopHasEvidence: boolean;
  };
}

export function loadOpenRmfHandoffPolicyReceiptsFixture(): OpenRmfHandoffPolicyReceiptsFixture {
  return loadFixture<OpenRmfHandoffPolicyReceiptsFixture>(
    "physical-ai/open-rmf-handoff-policy-receipts.v1.json",
  );
}

export interface MoveItManipulationPolicyReceiptsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scope: {
    readonly bridge: "ros2";
    readonly projectContext: "moveit";
    readonly boundary: "manipulation plan to physical execution";
    readonly goal: string;
    readonly nonGoal: string;
  };
  readonly requirements: {
    readonly plansArePrepareTier: boolean;
    readonly executionRequiresReview: boolean;
    readonly humanWorkspaceEscalates: boolean;
    readonly negativeOutcomesCarryReceipt: boolean;
    readonly receiptBindsPlanAndTrajectory: boolean;
  };
  readonly deployment: {
    readonly siteId: string;
    readonly robotId: string;
    readonly planningGroup: string;
    readonly workspaceId: string;
    readonly endEffectorId: string;
    readonly planRef: string;
    readonly trajectoryRef: string;
  };
  readonly receiptSchema: {
    readonly requiredFields: readonly string[];
    readonly sample: Record<string, string>;
  };
  readonly cases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly resourceSource: "topic" | "action";
    readonly topicName?: string;
    readonly actionName?: string;
    readonly operation: "publish" | "call";
    readonly expectedResource: string;
    readonly expectedDecision: DecisionAction;
    readonly expectedTier: ApprovalTier;
    readonly receiptRequired: boolean;
    readonly constraints?: {
      readonly maxVelocityMps?: number;
      readonly maxForceNewtons?: number;
    };
    readonly physicalContext?: {
      readonly humanDetected?: boolean;
      readonly currentVelocityMps?: number;
      readonly currentForceNewtons?: number;
    };
    readonly planReceiptPresent?: boolean;
    readonly policyViolated?: "MOVEIT_PLAN_RECEIPT_REQUIRED";
  }>;
  readonly successCriteria: {
    readonly planningIsPrepareTier: boolean;
    readonly executionIsHighConsequence: boolean;
    readonly humanWorkspaceEscalatesToCommit: boolean;
    readonly missingPlanReceiptDenied: boolean;
    readonly allOutcomesCarryReceipts: boolean;
  };
}

export function loadMoveItManipulationPolicyReceiptsFixture(): MoveItManipulationPolicyReceiptsFixture {
  return loadFixture<MoveItManipulationPolicyReceiptsFixture>(
    "physical-ai/moveit-manipulation-policy-receipts.v1.json",
  );
}

export interface Nav2NavigationPolicyReceiptsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scope: {
    readonly bridge: "ros2";
    readonly projectContext: "nav2";
    readonly boundary: "navigation intent to physical motion";
    readonly goal: string;
    readonly nonGoal: string;
  };
  readonly requirements: {
    readonly routePlansArePrepareTier: boolean;
    readonly navigationGoalsRouteThroughGateway: boolean;
    readonly motionCommandsRequireReview: boolean;
    readonly humanWorkspaceEscalates: boolean;
    readonly negativeOutcomesCarryReceipt: boolean;
  };
  readonly deployment: {
    readonly siteId: string;
    readonly robotId: string;
    readonly routeRef: string;
    readonly zoneAccessRef: string;
    readonly dockingStationId: string;
    readonly workspaceId: string;
  };
  readonly receiptSchema: {
    readonly requiredFields: readonly string[];
    readonly sample: Record<string, string>;
  };
  readonly mappingCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly actionName: string;
    readonly operation: "call";
    readonly expectedResource: string;
    readonly receiptRequired: boolean;
  }>;
  readonly policyCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly topicName: string;
    readonly operation: "publish";
    readonly expectedResource: string;
    readonly expectedDecision: DecisionAction;
    readonly expectedTier: ApprovalTier;
    readonly params?: Record<string, string>;
    readonly constraints?: {
      readonly maxVelocityMps?: number;
    };
    readonly physicalContext?: {
      readonly humanDetected?: boolean;
      readonly currentVelocityMps?: number;
    };
    readonly zoneAccessReceiptPresent?: boolean;
    readonly policyViolated?: "NAV2_ZONE_ACCESS_RECEIPT_REQUIRED";
    readonly receiptRequired: boolean;
  }>;
  readonly successCriteria: {
    readonly navigationGoalsCarryReceipts: boolean;
    readonly routePlanningIsPrepareTier: boolean;
    readonly dockingMotionIsHighConsequence: boolean;
    readonly humanWorkspaceEscalatesToCommit: boolean;
    readonly missingZoneReceiptDenied: boolean;
  };
}

export function loadNav2NavigationPolicyReceiptsFixture(): Nav2NavigationPolicyReceiptsFixture {
  return loadFixture<Nav2NavigationPolicyReceiptsFixture>(
    "physical-ai/nav2-navigation-policy-receipts.v1.json",
  );
}

export interface Px4OffboardPolicyReceiptsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scope: {
    readonly bridge: "mavlink";
    readonly projectContext: "px4";
    readonly boundary: "arming, offboard mode, and continuous setpoints";
    readonly goal: string;
    readonly nonGoal: string;
  };
  readonly requirements: {
    readonly armAndModeChangesRequireCommitReview: boolean;
    readonly velocitySetpointsRequireReview: boolean;
    readonly humanTakeoffZoneEscalates: boolean;
    readonly fenceChangesRequireEvidence: boolean;
    readonly negativeOutcomesCarryReceipt: boolean;
    readonly px4EncryptedLogCorrelationRequired: boolean;
  };
  readonly deployment: {
    readonly siteId: string;
    readonly vehicleId: string;
    readonly systemId: number;
    readonly missionRef: string;
    readonly corridorRef: string;
    readonly takeoffZoneId: string;
    readonly px4LogFormat?: "ulge";
    readonly px4LogEvidenceRef?: string;
  };
  readonly receiptSchema: {
    readonly requiredFields: readonly string[];
    readonly sample: Record<string, string | number>;
  };
  readonly mappingCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly intercept: {
      readonly messageType: "COMMAND_LONG" | "SET_POSITION_TARGET_LOCAL_NED";
      readonly systemId: number;
      readonly componentId: number;
      readonly payload: Record<string, number>;
    };
    readonly expectedResource: string;
    readonly expectedAction: "call" | "publish";
    readonly expectedTier: ApprovalTier;
    readonly expectedPhysicalContext?: {
      readonly currentVelocityMps?: number;
    };
    readonly receiptRequired: boolean;
  }>;
  readonly policyCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly expectedResource: string;
    readonly expectedDecision: DecisionAction;
    readonly expectedTier: ApprovalTier;
    readonly targetMode?: "OFFBOARD";
    readonly constraints?: {
      readonly maxVelocityMps?: number;
      readonly corridorRef?: string;
    };
    readonly physicalContext?: {
      readonly humanDetected?: boolean;
      readonly currentVelocityMps?: number;
    };
    readonly corridorReceiptPresent?: boolean;
    readonly policyViolated?: "PX4_CORRIDOR_RECEIPT_REQUIRED" | "PX4_ULOG_CORRELATION_REQUIRED";
    readonly receiptRequired: boolean;
  }>;
  readonly successCriteria: {
    readonly armAndModeStayCommitTier: boolean;
    readonly velocitySetpointsAreHighConsequence: boolean;
    readonly humanPresenceEscalatesToCommit: boolean;
    readonly missingCorridorReceiptDenied: boolean;
    readonly allOutcomesCarryReceipts: boolean;
    readonly missingUlogCorrelationDenied?: boolean;
  };
}

export function loadPx4OffboardPolicyReceiptsFixture(): Px4OffboardPolicyReceiptsFixture {
  return loadFixture<Px4OffboardPolicyReceiptsFixture>(
    "physical-ai/px4-offboard-policy-receipts.v1.json",
  );
}

export interface LeRobotPolicyActuationReceiptsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scope: {
    readonly bridge: "ros2";
    readonly projectContext: "lerobot";
    readonly boundary: "learned policy rollout to hardware actuation";
    readonly goal: string;
    readonly nonGoal: string;
  };
  readonly requirements: {
    readonly rolloutPlansArePrepareTier: boolean;
    readonly learnedExecutionRequiresReview: boolean;
    readonly actuationReceiptsBindCheckpointAndHardwareProfile: boolean;
    readonly humanWorkspaceEscalates: boolean;
    readonly checkpointMismatchDenied: boolean;
    readonly negativeOutcomesCarryReceipt: boolean;
  };
  readonly deployment: {
    readonly siteId: string;
    readonly robotId: string;
    readonly checkpointRef: string;
    readonly datasetRef: string;
    readonly rolloutRef: string;
    readonly hardwareProfileRef: string;
    readonly workspaceId: string;
    readonly endEffectorId: string;
  };
  readonly receiptSchema: {
    readonly requiredFields: readonly string[];
    readonly sample: Record<string, string>;
  };
  readonly mappingCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly resourceSource: "engine" | "topic";
    readonly resource?: string;
    readonly topicName?: string;
    readonly operation: "create" | "execute" | "publish";
    readonly expectedResource: string;
    readonly expectedTier: ApprovalTier;
    readonly receiptRequired: boolean;
  }>;
  readonly policyCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly resource: string;
    readonly operation: "create" | "execute" | "publish";
    readonly expectedDecision: DecisionAction;
    readonly expectedTier: ApprovalTier;
    readonly constraints?: {
      readonly maxVelocityMps?: number;
      readonly maxForceNewtons?: number;
    };
    readonly physicalContext?: {
      readonly humanDetected?: boolean;
      readonly currentVelocityMps?: number;
      readonly currentForceNewtons?: number;
    };
    readonly checkpointFingerprintMatches?: boolean;
    readonly policyViolated?: "CONSTRAINT_VIOLATION";
    readonly receiptRequired: boolean;
  }>;
  readonly successCriteria: {
    readonly rolloutPlanningIsPrepareTier: boolean;
    readonly learnedExecutionIsHighConsequence: boolean;
    readonly actuationBindsCheckpointAndHardwareProfile: boolean;
    readonly humanWorkspaceEscalatesToCommit: boolean;
    readonly checkpointMismatchDenied: boolean;
    readonly allOutcomesCarryReceipts: boolean;
  };
}

export interface Px4UlogCorrelationArtifactFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly requiredFields: readonly string[];
  readonly sample: {
    readonly artifactVersion: string;
    readonly artifactType: "px4-ulog-correlation";
    readonly siteId: string;
    readonly vehicleId: string;
    readonly missionRef: string;
    readonly requestId: string;
    readonly tokenId: string;
    readonly policyDecision: {
      readonly action: "allow" | "deny" | "escalate" | "transform";
      readonly assignedTier: ApprovalTier;
      readonly decisionEventType: string;
      readonly decisionEventHash: string;
      readonly decisionTimestamp: string;
    };
    readonly px4LogEvidence: {
      readonly logFormat: "ulge";
      readonly encryptedLogDigest: string;
      readonly decryptedLogDigest: string;
      readonly keyRef: string;
      readonly decryptEnvironmentRef: string;
      readonly ulogTimeWindow: {
        readonly start: string;
        readonly end: string;
      };
    };
    readonly correlation: {
      readonly matchedEvents: readonly Array<{
        readonly type: string;
        readonly targetMode?: string;
        readonly sintEventTimestamp: string;
        readonly ulogTimestamp: string;
        readonly deltaMs: number;
      }>;
      readonly correlationStatus: "matched" | "mismatch";
      readonly maxAllowedDeltaMs: number;
    };
    readonly review: {
      readonly reviewedBy: string;
      readonly reviewTimestamp: string;
      readonly notes: string;
    };
  };
}

export function loadPx4UlogCorrelationArtifactFixture(): Px4UlogCorrelationArtifactFixture {
  return loadFixture<Px4UlogCorrelationArtifactFixture>(
    "physical-ai/px4-ulog-correlation-artifact.v1.json",
  );
}

export function loadLeRobotPolicyActuationReceiptsFixture(): LeRobotPolicyActuationReceiptsFixture {
  return loadFixture<LeRobotPolicyActuationReceiptsFixture>(
    "physical-ai/lerobot-policy-actuation-receipts.v1.json",
  );
}

export interface SolarFieldOperationsPolicyReceiptsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scope: {
    readonly bridge: "ros2";
    readonly projectContext: "solar-field-operations";
    readonly boundary: "inspection, cleaning, and installation actuation";
    readonly goal: string;
    readonly nonGoal: string;
  };
  readonly requirements: {
    readonly inspectionInferenceStaysObserveTier: boolean;
    readonly routePlansArePrepareTier: boolean;
    readonly motionAndToolActuationRequireReview: boolean;
    readonly weatherPermitRequired: boolean;
    readonly humanAisleEscalates: boolean;
    readonly lotoRequiredForInstallation: boolean;
    readonly negativeOutcomesCarryReceipt: boolean;
  };
  readonly deployment: {
    readonly siteId: string;
    readonly rowId: string;
    readonly trackerId: string;
    readonly cleanerRobotId: string;
    readonly installerRobotId: string;
    readonly weatherPermitRef: string;
    readonly lotoPermitRef: string;
    readonly workspaceId: string;
  };
  readonly receiptSchema: {
    readonly requiredFields: readonly string[];
    readonly sample: Record<string, string>;
  };
  readonly mappingCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly resourceSource: "engine" | "topic";
    readonly resource?: string;
    readonly topicName?: string;
    readonly operation: "inference" | "create" | "publish";
    readonly expectedResource: string;
    readonly expectedTier: ApprovalTier;
    readonly receiptRequired: boolean;
  }>;
  readonly policyCases: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly resource: string;
    readonly operation: "inference" | "create" | "publish";
    readonly expectedDecision: DecisionAction;
    readonly expectedTier: ApprovalTier;
    readonly constraints?: {
      readonly maxVelocityMps?: number;
    };
    readonly physicalContext?: {
      readonly humanDetected?: boolean;
      readonly currentVelocityMps?: number;
    };
    readonly weatherPermitPresent?: boolean;
    readonly lotoPermitPresent?: boolean;
    readonly policyViolated?: "SOLAR_WEATHER_PERMIT_REQUIRED" | "SOLAR_LOTO_REQUIRED";
    readonly receiptRequired: boolean;
  }>;
  readonly successCriteria: {
    readonly inspectionIsObserveTier: boolean;
    readonly planningIsPrepareTier: boolean;
    readonly cleaningMotionIsHighConsequence: boolean;
    readonly humanAisleEscalatesToCommit: boolean;
    readonly weatherPermitRequiredForMotion: boolean;
    readonly lotoRequiredForInstallation: boolean;
    readonly allOutcomesCarryReceipts: boolean;
  };
}

export function loadSolarFieldOperationsPolicyReceiptsFixture(): SolarFieldOperationsPolicyReceiptsFixture {
  return loadFixture<SolarFieldOperationsPolicyReceiptsFixture>(
    "physical-ai/solar-field-operations-policy-receipts.v1.json",
  );
}

export interface EuAiActConformityPackFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly regulation: {
    readonly name: "Regulation (EU) 2024/1689";
    readonly officialTextDate: string;
    readonly scopeNote: string;
    readonly references: readonly Array<{
      readonly id:
        | "eu-ai-act-article-13"
        | "eu-ai-act-article-14"
        | "eu-ai-act-annex-iv";
      readonly title: string;
      readonly url: string;
    }>;
  };
  readonly deployment: {
    readonly systemName: string;
    readonly intendedPurpose: string;
    readonly operatorRole: string;
    readonly robotCategory: "service-robot-near-humans";
    readonly riskAssumptions: readonly string[];
  };
  readonly article13TransparencyExport: {
    readonly requiredFields: readonly string[];
    readonly resourceCatalog: readonly Array<{
      readonly resourcePattern: string;
      readonly action: string;
      readonly tier: ApprovalTier;
      readonly deployersShouldKnow: string;
    }>;
    readonly knownLimitations: readonly string[];
    readonly logAccessProcedure: string;
  };
  readonly article14HumanOversightExport: {
    readonly requiredFields: readonly string[];
    readonly oversightRole: string;
    readonly interventionPoints: readonly Array<{
      readonly tier: ApprovalTier;
      readonly mechanism: string;
      readonly evidenceSource: string;
    }>;
    readonly stopControl: {
      readonly type: "unconditional-estop";
      readonly ledgerEvent: "safety.estop.triggered";
      readonly requiresTokenValidation: false;
      readonly rollbackEvidenceRequired: boolean;
    };
    readonly operatorTrainingEvidence: {
      readonly required: boolean;
      readonly artifactRef: string;
    };
    readonly postIncidentReview: {
      readonly required: boolean;
      readonly artifactRef: string;
    };
  };
  readonly annexIVChecklist: readonly Array<{
    readonly id: string;
    readonly title: string;
    readonly sintArtifactRefs: readonly string[];
  }>;
  readonly iso13482Crosswalk: readonly Array<{
    readonly topic: string;
    readonly sintControl: string;
    readonly evidenceSource: string;
  }>;
  readonly successCriteria: {
    readonly article13GeneratedFromFixtureData: boolean;
    readonly article14T2T3EvidenceRequired: boolean;
    readonly annexIVArtifactsReferenced: boolean;
    readonly iso13482CrosswalkIncluded: boolean;
    readonly externalReviewerReady: boolean;
  };
}

export function loadEuAiActConformityPackFixture(): EuAiActConformityPackFixture {
  return loadFixture<EuAiActConformityPackFixture>(
    "compliance/eu-ai-act-conformity-pack.v1.json",
  );
}

export interface HardwareSafetyPhaseAKpisFixture {
  readonly version: string;
  readonly phase: string;
  readonly quarter: string;
  readonly description: string;
  readonly kpis: readonly Array<{
    readonly id: string;
    readonly name: string;
    readonly target: string;
    readonly targetMs?: number;
    readonly targetCount?: number;
    readonly benchmarkSuite?: string;
    readonly invariant?: string;
  }>;
}

export function loadHardwareSafetyPhaseAKpisFixture(): HardwareSafetyPhaseAKpisFixture {
  return loadFixture<HardwareSafetyPhaseAKpisFixture>(
    "industrial/hardware-safety-phase-a-kpis.json",
  );
}

export interface IndustrialCellSafetyPackFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scopeNote: string;
  readonly deployment: {
    readonly siteId: string;
    readonly cellId: string;
    readonly profile: "industrial-humanoid-cell";
    readonly actors: readonly string[];
    readonly resources: readonly string[];
  };
  readonly policyTemplates: readonly Array<{
    readonly templateId: string;
    readonly resourcePattern: string;
    readonly requiredHardwareSafety: {
      readonly permitState: "granted";
      readonly interlockState: "closed";
      readonly estopState: "clear";
      readonly maxObservedAgeMs: number;
    };
    readonly defaultTier: ApprovalTier;
  }>;
  readonly cellScenarios: readonly Array<{
    readonly id: string;
    readonly description: string;
    readonly resource: string;
    readonly action: "prepare" | "publish" | "override";
    readonly physicalContext?: {
      readonly humanDetected?: boolean;
    };
    readonly hardwareSafety: {
      readonly permitState: "granted" | "denied" | "unknown" | "stale";
      readonly interlockState: "closed" | "open" | "fault" | "unknown";
      readonly estopState: "clear" | "triggered" | "unknown";
      readonly controllerId: string;
      readonly observedAgeMs: number;
    };
    readonly expectedDecision: "allow" | "deny" | "escalate" | "rollback";
    readonly expectedTier: ApprovalTier;
    readonly policyViolated: string;
    readonly evidenceEvent: string;
    readonly rollbackTargetRef?: string;
  }>;
  readonly fmeaExport: readonly Array<{
    readonly failureMode: string;
    readonly sourceScenarioId: string;
    readonly hazard: string;
    readonly sintDetection: string;
    readonly sintControl: string;
    readonly severity: number;
    readonly occurrence: number;
    readonly detection: number;
    readonly requiredEvidence: readonly string[];
  }>;
  readonly sotifIso26262Mapping: readonly Array<{
    readonly topic: string;
    readonly sintSupport: string;
    readonly claimBoundary: string;
  }>;
  readonly timingReport: {
    readonly kpiFixtureRef: string;
    readonly requiredKpis: readonly string[];
    readonly requiresBenchmarkReport: boolean;
  };
  readonly successCriteria: {
    readonly guardDoorInterlockCovered: boolean;
    readonly zoneOccupancyCovered: boolean;
    readonly permitRevocationCovered: boolean;
    readonly emergencyStopCovered: boolean;
    readonly fmeaRowsReferenceScenarios: boolean;
    readonly claimsRemainSupportOnly: boolean;
  };
}

export function loadIndustrialCellSafetyPackFixture(): IndustrialCellSafetyPackFixture {
  return loadFixture<IndustrialCellSafetyPackFixture>(
    "industrial/industrial-cell-safety-pack.v1.json",
  );
}

export interface IndustrialHumanoidShipyardSafetyPackFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scopeNote: string;
  readonly deployment: {
    readonly siteId: string;
    readonly vesselBlockId: string;
    readonly profile: "industrial-humanoid-shipyard";
    readonly actors: readonly string[];
    readonly robots: readonly Array<{
      readonly id: string;
      readonly kind: "humanoid";
      readonly primaryTools: readonly string[];
    }>;
    readonly resources: readonly string[];
  };
  readonly policyTemplates: readonly Array<{
    readonly templateId: string;
    readonly resourcePattern: string;
    readonly defaultTier: ApprovalTier;
    readonly requiredPermits: readonly string[];
    readonly requiredHardwareSafety: {
      readonly permitState: "granted";
      readonly interlockState: "closed";
      readonly estopState: "clear";
      readonly maxObservedAgeMs: number;
    };
  }>;
  readonly shipyardScenarios: readonly Array<{
    readonly id: string;
    readonly description: string;
    readonly resource: string;
    readonly action: "observe" | "execute" | "enter" | "override";
    readonly operation:
      | "visual_inspection"
      | "arc_weld_start"
      | "confined_space_entry"
      | "material_lift"
      | "estop";
    readonly permits?: Record<string, boolean>;
    readonly constraints?: {
      readonly maxLoadKg?: number;
    };
    readonly physicalContext?: {
      readonly humanDetected?: boolean;
      readonly distanceToHumanM?: number;
      readonly currentLoadKg?: number;
    };
    readonly simulation?: {
      readonly expectedProgramDigest: string;
      readonly submittedProgramDigest: string;
      readonly receiptDigest: string;
    };
    readonly hardwareSafety: {
      readonly permitState: "granted" | "denied" | "unknown" | "stale";
      readonly interlockState: "closed" | "open" | "fault" | "unknown";
      readonly estopState: "clear" | "triggered" | "unknown";
      readonly controllerId: string;
      readonly observedAgeMs: number;
    };
    readonly expectedDecision: "allow" | "deny" | "escalate" | "rollback";
    readonly expectedTier: ApprovalTier;
    readonly policyViolated?: string;
    readonly evidenceEvent: string;
    readonly rollbackTargetRef?: string;
    readonly receiptRequired: boolean;
  }>;
  readonly absEvidenceExport: {
    readonly purpose: string;
    readonly format: "json-lines";
    readonly requiredFields: readonly string[];
    readonly dataQualityRules: readonly Array<{
      readonly ruleId: string;
      readonly description: string;
      readonly maxSkewMs?: number;
      readonly required?: boolean;
    }>;
  };
  readonly fmeaExport: readonly Array<{
    readonly failureMode: string;
    readonly sourceScenarioId: string;
    readonly hazard: string;
    readonly sintDetection: string;
    readonly sintControl: string;
    readonly severity: number;
    readonly occurrence: number;
    readonly detection: number;
    readonly requiredEvidence: readonly string[];
  }>;
  readonly safetyCaseMapping: readonly Array<{
    readonly topic: string;
    readonly sintSupport: string;
    readonly claimBoundary: string;
  }>;
  readonly sprintPlan: {
    readonly duration: string;
    readonly goal: string;
    readonly workstreams: readonly Array<{
      readonly id: string;
      readonly name: string;
      readonly deliverables: readonly string[];
    }>;
  };
  readonly successCriteria: {
    readonly hotWorkPermitCovered: boolean;
    readonly fireWatchCovered: boolean;
    readonly fumeExtractionCovered: boolean;
    readonly unsafeAtmosphereCovered: boolean;
    readonly bystanderInWeldZoneCovered: boolean;
    readonly simulationReceiptMismatchCovered: boolean;
    readonly supervisorApprovalForWeldingCovered: boolean;
    readonly loadEnvelopeCovered: boolean;
    readonly estopRollbackCovered: boolean;
    readonly absEvidenceExportHasDataQualityRules: boolean;
    readonly fmeaRowsReferenceExecutableScenarios: boolean;
    readonly claimsRemainSupportOnly: boolean;
  };
}

export function loadIndustrialHumanoidShipyardSafetyPackFixture(): IndustrialHumanoidShipyardSafetyPackFixture {
  return loadFixture<IndustrialHumanoidShipyardSafetyPackFixture>(
    "industrial/industrial-humanoid-shipyard-safety-pack.v1.json",
  );
}

export interface FactoryActionDemoFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly scopeNote: string;
  readonly prompt: string;
  readonly factoryIntent: {
    readonly intent_id: string;
    readonly goal: string;
    readonly industry: string;
    readonly materials: readonly string[];
    readonly stations: readonly string[];
    readonly constraints: {
      readonly max_capex_usd: number;
      readonly floor_space_m2: number;
      readonly takt_time_seconds: number;
      readonly human_collaboration: boolean;
      readonly safety_standard_targets: readonly string[];
    };
    readonly metadata?: Record<string, unknown>;
  };
  readonly cellGraph: {
    readonly cell_id: string;
    readonly assets: readonly Array<{
      readonly asset_id: string;
      readonly type: string;
      readonly vendor: string;
      readonly controller?: string;
      readonly adapter: string;
      readonly safety_zone?: string;
      readonly capabilities?: readonly string[];
    }>;
    readonly flows: readonly Array<{
      readonly from: string;
      readonly to: string;
      readonly material: string;
      readonly rate_per_minute: number;
    }>;
    readonly approval_tier: ApprovalTier | "T3_HUMAN_REQUIRED";
    readonly simulation_required: boolean;
  };
  readonly robotAction: {
    readonly action_type: string;
    readonly target_robot: string;
    readonly motion: {
      readonly source_pose: string;
      readonly target_pose: string;
      readonly max_velocity_mps: number;
      readonly max_force_newtons: number;
      readonly collision_check: boolean;
    };
    readonly tool: {
      readonly type: string;
      readonly payload_kg: number;
    };
    readonly requires: {
      readonly simulation_receipt: boolean;
      readonly human_approval: boolean;
      readonly safety_zone_clear: boolean;
    };
    readonly adapter_hint?: string;
  };
  readonly simulationReceipt: {
    readonly simulation_receipt_id: string;
    readonly cell_id: string;
    readonly simulator: string;
    readonly vendor_program_hash: string;
    readonly collision_free: boolean;
    readonly cycle_time_seconds: number;
    readonly safety_zone_violations: number;
    readonly max_force_newtons: number;
    readonly approved_for_execution: boolean;
    readonly signed_by: string;
    readonly metadata?: Record<string, unknown>;
  };
  readonly decisionPath: readonly Array<{
    readonly id:
      | "deny-without-simulation"
      | "escalate-after-simulation"
      | "allow-after-human-approval";
    readonly description: string;
    readonly inputs: {
      readonly simulationReceiptPresent: boolean;
      readonly humanApprovalPresent: boolean;
      readonly safetyZoneClear: boolean;
    };
    readonly expectedDecision: {
      readonly action: DecisionAction;
      readonly assignedTier: ApprovalTier;
      readonly denial?: {
        readonly reason: string;
        readonly policyViolated: string;
      };
      readonly escalation?: {
        readonly requiredTier: ApprovalTier;
        readonly timeoutMs: number;
      };
    };
  }>;
  readonly approval: {
    readonly approvalId: string;
    readonly requiredTier: ApprovalTier;
    readonly quorum: {
      readonly required: number;
      readonly authorizedRoles: readonly string[];
    };
    readonly approverRef: string;
    readonly evidenceEvent: string;
  };
  readonly adapterStubs: readonly Array<{
    readonly adapterId: string;
    readonly vendor: string;
    readonly targetLanguage: string;
    readonly executionResource: string;
    readonly generatedProgramHash: string;
    readonly mapsActionFields: readonly string[];
  }>;
  readonly receiptChain: readonly Array<{
    readonly step: string;
    readonly eventType: string;
    readonly digest: string;
    readonly previousDigest: string | null;
  }>;
  readonly successCriteria: {
    readonly denyWithoutSimulation: boolean;
    readonly escalateAfterSimulation: boolean;
    readonly allowOnlyAfterHumanApproval: boolean;
    readonly atLeastTwoVendorStubs: boolean;
    readonly atLeastFourVendorStubs?: boolean;
    readonly receiptChainIsAppendOnly: boolean;
    readonly claimsRemainSimulationOnly: boolean;
  };
}

export function loadFactoryActionDemoFixture(): FactoryActionDemoFixture {
  return loadFixture<FactoryActionDemoFixture>(
    "industrial/factory-action-demo.v1.json",
  );
}

export interface RegulatedConsentExtensionsFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly status: "experimental";
  readonly scopeNote: string;
  readonly consentEventSchema: {
    readonly requiredFields: readonly string[];
    readonly allowedModalities: readonly string[];
    readonly privacyRules: {
      readonly rawAudioStored: false;
      readonly rawVideoStored: false;
      readonly biometricTemplateStored: false;
      readonly digestAlgorithm: "sha-256";
      readonly minimizeGrantorRef: boolean;
    };
  };
  readonly consentScopes: readonly Array<{
    readonly scopeId: string;
    readonly subjectRole: "patient" | "worker" | "resident";
    readonly grantorRef: string;
    readonly delegateRef?: string;
    readonly resourcePattern: string;
    readonly actions: readonly string[];
    readonly maxAgeSeconds: number;
    readonly revocable: boolean;
  }>;
  readonly sampleEvents: readonly Array<{
    readonly name: string;
    readonly consentId: string;
    readonly grantorRef: string;
    readonly subjectRole: "patient" | "worker" | "resident";
    readonly scopeId: string;
    readonly tokenId: string;
    readonly resource: string;
    readonly action: string;
    readonly modalities: readonly string[];
    readonly evidenceDigest: string;
    readonly rawEvidenceStored: boolean;
    readonly expiresAt: string;
    readonly revocable: boolean;
    readonly revokedAt?: string;
    readonly expectedDecision: "allow" | "deny" | "escalate";
    readonly assignedTier: ApprovalTier;
    readonly policyViolated?: string;
  }>;
  readonly privacyPreservingEvidenceRules: readonly Array<{
    readonly sensor: "camera" | "microphone" | "biometric";
    readonly allowedEvidence: readonly string[];
    readonly forbiddenEvidence: readonly string[];
  }>;
  readonly incidentExportPrototypes: readonly Array<{
    readonly domain: "home" | "medical";
    readonly name: string;
    readonly requiredFields: readonly string[];
    readonly experimental: boolean;
  }>;
  readonly successCriteria: {
    readonly consentEvidenceTokenBound: boolean;
    readonly consentEvidenceRevocable: boolean;
    readonly rawSensitiveMediaNeverRequired: boolean;
    readonly incidentExportsMarkedExperimental: boolean;
    readonly regulatedDomainClaimsRequirePartnerValidation: boolean;
  };
}

export function loadRegulatedConsentExtensionsFixture(): RegulatedConsentExtensionsFixture {
  return loadFixture<RegulatedConsentExtensionsFixture>(
    "compliance/regulated-consent-extensions.v1.json",
  );
}

export interface RegulatedAgentRuntimeFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly status: "experimental";
  readonly scopeNote: string;
  readonly runtimeSurfaces: readonly string[];
  readonly defaults: {
    readonly enforcementChokePoint: "PolicyGateway.intercept";
    readonly evidenceLedgerAppendOnly: true;
    readonly contextInheritanceAttenuationOnly: true;
    readonly rawSensitivePayloadsStoredInLedger: false;
    readonly approvedProcessors: readonly string[];
    readonly approvedRegions: readonly string[];
    readonly approvedModels: readonly string[];
  };
  readonly dataClasses: readonly Array<{
    readonly classId: string;
    readonly description: string;
    readonly examples: readonly string[];
    readonly defaultTier: ApprovalTier;
    readonly requiresConsent: boolean;
    readonly allowedEvidence: readonly string[];
    readonly forbiddenEvidence: readonly string[];
  }>;
  readonly policyRequirements: readonly Array<{
    readonly requirementId: string;
    readonly description: string;
    readonly receiptFields: readonly string[];
  }>;
  readonly scenarios: readonly Array<{
    readonly name: string;
    readonly principal: string;
    readonly token: {
      readonly tokenId: string;
      readonly resourcePattern: string;
      readonly actions: readonly string[];
      readonly dataClasses: readonly string[];
      readonly purposeOfUse: readonly string[];
      readonly allowedProcessors: readonly string[];
      readonly allowedRegions: readonly string[];
      readonly allowedModels: readonly string[];
      readonly expiresAt: string;
      readonly delegatedFrom?: string;
      readonly inheritedContextFields?: readonly string[];
    };
    readonly request: {
      readonly resource: string;
      readonly action: string;
      readonly dataClasses: readonly string[];
      readonly purposeOfUse: string;
      readonly processor: string;
      readonly region: string;
      readonly model: string;
      readonly requestedContextFields: readonly string[];
      readonly fallback?: {
        readonly processor: string;
        readonly region: string;
        readonly model: string;
        readonly transformations: readonly string[];
      };
    };
    readonly expected: {
      readonly decisionAction: DecisionAction;
      readonly assignedTier: ApprovalTier;
      readonly policyViolated?: string;
      readonly transformations?: readonly string[];
      readonly evidenceRequired: boolean;
      readonly receiptFields: readonly string[];
    };
  }>;
  readonly tokenBoundAuthority: {
    readonly extensionName: "regulatedDataPolicy";
    readonly signedFields: readonly string[];
    readonly signaturePayloadIncludesExtension: boolean;
    readonly deploymentPolicyCannotExpandToken: boolean;
    readonly delegationAttenuationOnly: boolean;
    readonly parentPolicy: {
      readonly allowedDataClasses: readonly string[];
      readonly allowedPurposes: readonly string[];
      readonly approvedProcessors: readonly string[];
      readonly approvedRegions: readonly string[];
      readonly approvedModels: readonly string[];
      readonly allowedContextFields: readonly string[];
      readonly allowFallback: boolean;
    };
    readonly validDelegation: {
      readonly allowedDataClasses: readonly string[];
      readonly allowedPurposes: readonly string[];
      readonly approvedProcessors: readonly string[];
      readonly approvedRegions: readonly string[];
      readonly approvedModels: readonly string[];
      readonly allowedContextFields: readonly string[];
      readonly allowFallback: boolean;
    };
    readonly invalidDelegations: readonly Array<{
      readonly name: string;
      readonly requestedPolicy: {
        readonly allowedDataClasses?: readonly string[];
        readonly allowedPurposes?: readonly string[];
        readonly approvedProcessors?: readonly string[];
        readonly approvedRegions?: readonly string[];
        readonly approvedModels?: readonly string[];
        readonly allowedContextFields?: readonly string[];
        readonly allowFallback?: boolean;
      };
      readonly expectedError: "INSUFFICIENT_PERMISSIONS";
    }>;
  };
  readonly successCriteria: {
    readonly everyDecisionFlowsThroughPolicyGateway: boolean;
    readonly inheritedContextOnlyNarrows: boolean;
    readonly tokenBoundPolicySigned: boolean;
    readonly tokenBoundPolicyDelegatesByAttenuationOnly: boolean;
    readonly unapprovedProcessorsDenied: boolean;
    readonly crossRegionTransfersDeniedOrRerouted: boolean;
    readonly sensitivePayloadsMinimizedInEvidence: boolean;
    readonly transformReceiptsExplainRedactionAndFallback: boolean;
    readonly claimsRemainRuntimeControlsNotCertification: boolean;
  };
}

export function loadRegulatedAgentRuntimeFixture(): RegulatedAgentRuntimeFixture {
  return loadFixture<RegulatedAgentRuntimeFixture>(
    "compliance/regulated-agent-runtime.v1.json",
  );
}
