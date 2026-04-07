/**
 * SINT conformance fixture loader.
 *
 * Loads canonical JSON fixtures that external partners can reuse for
 * interoperability certification.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApprovalTier, PolicyDecision } from "@sint/core";
import type { OpcUaOperation } from "@sint/bridge-opcua";
import type { RouteCandidate } from "@sint/bridge-economy";

const ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(ROOT, "../fixtures");

type DecisionAction = PolicyDecision["action"];

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
