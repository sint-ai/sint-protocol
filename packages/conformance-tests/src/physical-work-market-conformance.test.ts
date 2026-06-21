/**
 * Physical work market governance fixture conformance.
 *
 * Covers a SINT-native robotics market lifecycle:
 * - scoped physical-work capabilities
 * - registered requester, robot, and validator identities
 * - supported robot subnets
 * - collateralized robot bids
 * - deterministic simulation proof before deployment
 * - deployment escalation before physical execution
 * - PoPW sensor bundle completeness and deadline binding
 * - validator quorum and safety thresholds
 * - settlement state and receipt replay checks
 */

import { describe, expect, it } from "vitest";
import {
  loadPhysicalWorkMarketFixture,
  type PhysicalWorkDecision,
  type PhysicalWorkDecisionReason,
  type PhysicalWorkMarketCase,
  type PhysicalWorkMarketFixture,
  type PhysicalWorkTaskStatus,
} from "./fixture-loader.js";

interface PhysicalWorkDecisionResult {
  readonly decision: PhysicalWorkDecision;
  readonly reason: PhysicalWorkDecisionReason;
  readonly requiredTier?: string;
  readonly nextStatus?: PhysicalWorkTaskStatus;
  readonly evidenceRequired: boolean;
}

class PhysicalWorkMarketHarness {
  private readonly registeredIdentities: Set<string>;
  private readonly supportedSubnets: Set<string>;
  private readonly usedSettlementReceiptIds: Set<string>;
  private readonly referenceTimeMs: number;

  constructor(private readonly fixture: PhysicalWorkMarketFixture) {
    this.registeredIdentities = new Set(fixture.defaults.registeredIdentities);
    this.supportedSubnets = new Set(fixture.defaults.supportedSubnets);
    this.usedSettlementReceiptIds = new Set(fixture.defaults.usedSettlementReceiptIds);
    this.referenceTimeMs = Date.parse(fixture.defaults.referenceTime);
  }

  evaluate(scenario: PhysicalWorkMarketCase): PhysicalWorkDecisionResult {
    if (!this.hasScope(scenario)) {
      return this.deny("SCOPE_NOT_AUTHORIZED");
    }

    const { request } = scenario;
    const { task } = request;
    if (!task) {
      return this.deny("STATE_TRANSITION_INVALID");
    }

    if (!this.supportedSubnets.has(task.subnet)) {
      return this.deny("SUBNET_NOT_SUPPORTED");
    }

    switch (request.action) {
      case "broadcast_task":
        return this.evaluateBroadcast(scenario);
      case "submit_bid":
        return this.evaluateBid(scenario);
      case "submit_sim_proof":
        return this.evaluateSimulationProof(scenario);
      case "deploy_policy":
        return this.evaluateDeployment(scenario);
      case "submit_popw":
        return this.evaluatePopw(scenario);
      case "verify_popw":
        return this.evaluateVerification(scenario);
      case "release_settlement":
        return this.evaluateSettlement(scenario);
      default:
        return this.deny("STATE_TRANSITION_INVALID");
    }
  }

  private evaluateBroadcast(
    scenario: PhysicalWorkMarketCase,
  ): PhysicalWorkDecisionResult {
    const task = scenario.request.task;
    if (!task || task.status !== "draft") {
      return this.deny("STATE_TRANSITION_INVALID");
    }
    if (!this.registeredIdentities.has(scenario.principal)) {
      return this.deny("IDENTITY_REQUIRED");
    }
    if (task.rewardUsdc >= this.fixture.defaults.highValueApprovalThresholdUsdc) {
      return {
        decision: "escalate",
        reason: "VALUE_REQUIRES_APPROVAL",
        requiredTier: "T3_COMMIT",
        nextStatus: "open",
        evidenceRequired: true,
      };
    }
    return this.allow("open", false);
  }

  private evaluateBid(scenario: PhysicalWorkMarketCase): PhysicalWorkDecisionResult {
    const { bid, task } = scenario.request;
    if (!task || task.status !== "open" || !bid) {
      return this.deny("STATE_TRANSITION_INVALID");
    }
    if (
      !this.registeredIdentities.has(scenario.principal) ||
      !this.registeredIdentities.has(bid.robotId) ||
      scenario.principal !== bid.robotId
    ) {
      return this.deny("IDENTITY_REQUIRED");
    }

    const minStake = this.fixture.defaults.minStakeBySubnetUsdc[task.subnet] ?? Infinity;
    if (bid.stakeUsdc < minStake) {
      return this.deny("STAKE_BELOW_MINIMUM");
    }

    return this.allow("bid_submitted", false);
  }

  private evaluateSimulationProof(
    scenario: PhysicalWorkMarketCase,
  ): PhysicalWorkDecisionResult {
    const { simulationProof, task } = scenario.request;
    if (!task || task.status !== "bid_selected") {
      return this.deny("STATE_TRANSITION_INVALID");
    }
    if (task.selectedRobot && scenario.principal !== task.selectedRobot) {
      return this.deny("IDENTITY_REQUIRED");
    }
    if (!this.simulationProofPasses(simulationProof)) {
      return this.deny("SIM_PROOF_REQUIRED");
    }
    return this.allow("sim_passed", true);
  }

  private evaluateDeployment(
    scenario: PhysicalWorkMarketCase,
  ): PhysicalWorkDecisionResult {
    const { simulationProof, task } = scenario.request;
    if (!task || (task.status !== "bid_selected" && task.status !== "sim_passed")) {
      return this.deny("STATE_TRANSITION_INVALID");
    }
    if (task.selectedRobot && scenario.principal !== task.selectedRobot) {
      return this.deny("IDENTITY_REQUIRED");
    }
    if (task.status !== "sim_passed" || !this.simulationProofPasses(simulationProof)) {
      return this.deny("SIM_PROOF_REQUIRED");
    }

    return {
      decision: "escalate",
      reason: "VALUE_REQUIRES_APPROVAL",
      requiredTier: task.requiredTier,
      nextStatus: "executing",
      evidenceRequired: true,
    };
  }

  private evaluatePopw(
    scenario: PhysicalWorkMarketCase,
  ): PhysicalWorkDecisionResult {
    const { popwBundle, task } = scenario.request;
    if (!task || task.status !== "executing") {
      return this.deny("STATE_TRANSITION_INVALID");
    }
    if (Date.parse(task.deadline) <= this.referenceTimeMs) {
      return this.deny("DEADLINE_EXPIRED");
    }
    if (!popwBundle) {
      return this.deny("POPW_BUNDLE_REQUIRED");
    }
    if (task.selectedRobot && popwBundle.robotId !== task.selectedRobot) {
      return this.deny("IDENTITY_REQUIRED");
    }
    if (!this.popwBundleComplete(task, popwBundle)) {
      return this.deny("POPW_BUNDLE_INCOMPLETE");
    }
    return this.allow("proof_submitted", true);
  }

  private evaluateVerification(
    scenario: PhysicalWorkMarketCase,
  ): PhysicalWorkDecisionResult {
    const { task, validatorAttestations } = scenario.request;
    if (!task || task.status !== "proof_submitted") {
      return this.deny("STATE_TRANSITION_INVALID");
    }
    if (!this.registeredIdentities.has(scenario.principal)) {
      return this.deny("IDENTITY_REQUIRED");
    }

    const successful = (validatorAttestations ?? []).filter(
      (attestation) =>
        this.registeredIdentities.has(attestation.validatorId) &&
        attestation.verdict === "success" &&
        attestation.evidenceHash.length > 0,
    );

    if (successful.length < this.fixture.defaults.validatorQuorum) {
      return this.deny("VALIDATOR_QUORUM_NOT_MET");
    }
    if (
      successful.some(
        (attestation) =>
          attestation.safety < this.fixture.defaults.minVerifierSafetyScore,
      )
    ) {
      return this.deny("VERIFIER_SAFETY_BELOW_THRESHOLD");
    }

    return this.allow("verified", true);
  }

  private evaluateSettlement(
    scenario: PhysicalWorkMarketCase,
  ): PhysicalWorkDecisionResult {
    const { settlement, task } = scenario.request;
    if (!task || !settlement || task.status !== "verified") {
      return this.deny("SETTLEMENT_STATE_INVALID");
    }
    if (this.usedSettlementReceiptIds.has(settlement.receiptId)) {
      return this.deny("RECEIPT_REPLAY");
    }
    if (settlement.recipient !== task.selectedRobot || settlement.amountUsdc !== task.rewardUsdc) {
      return this.deny("SETTLEMENT_STATE_INVALID");
    }
    this.usedSettlementReceiptIds.add(settlement.receiptId);
    return this.allow("settled", true);
  }

  private simulationProofPasses(
    proof: PhysicalWorkMarketCase["request"]["simulationProof"],
  ): boolean {
    return (
      Boolean(proof?.digest) &&
      proof?.deterministicReplay === true &&
      (proof.safetyScore ?? 0) >= this.fixture.defaults.minSimulationSafetyScore
    );
  }

  private popwBundleComplete(
    task: NonNullable<PhysicalWorkMarketCase["request"]["task"]>,
    bundle: NonNullable<PhysicalWorkMarketCase["request"]["popwBundle"]>,
  ): boolean {
    const requiredSensors = this.fixture.defaults.requiredSensorsBySubnet[task.subnet] ?? [];
    const providedSensors = new Set(bundle.sensors);
    return (
      bundle.taskId === task.id &&
      bundle.deadline === task.deadline &&
      Boolean(bundle.actionRef) &&
      Boolean(bundle.mediaHash) &&
      Boolean(bundle.bundleHash) &&
      requiredSensors.every((sensor) => providedSensors.has(sensor))
    );
  }

  private hasScope(scenario: PhysicalWorkMarketCase): boolean {
    const { capability, request } = scenario;
    return (
      capability.actions.includes(request.action) &&
      capability.resources.some((resource) => resourceMatches(resource, request.resource))
    );
  }

  private allow(
    nextStatus: PhysicalWorkTaskStatus | undefined,
    evidenceRequired: boolean,
  ): PhysicalWorkDecisionResult {
    return {
      decision: "allow",
      reason: "ALLOW",
      nextStatus,
      evidenceRequired,
    };
  }

  private deny(reason: PhysicalWorkDecisionReason): PhysicalWorkDecisionResult {
    return {
      decision: "deny",
      reason,
      evidenceRequired: true,
    };
  }
}

function resourceMatches(pattern: string, resource: string): boolean {
  if (pattern === resource) return true;
  if (pattern.endsWith("*")) {
    return resource.startsWith(pattern.slice(0, -1));
  }
  return false;
}

describe("physical work market conformance", () => {
  const fixture = loadPhysicalWorkMarketFixture();
  const harness = new PhysicalWorkMarketHarness(fixture);

  it("declares the physical work market profile vocabulary", () => {
    expect(fixture.fixtureId).toBe("sint.physical-ai.physical-work-market.v1");
    expect(fixture.profile.resources).toContain("pwork://task/*");
    expect(fixture.profile.resources).toContain("pwork://proof/*");
    expect(fixture.profile.actions).toContain("deploy_policy");
    expect(fixture.profile.actions).toContain("release_settlement");
    expect(fixture.profile.decisionReasons).toContain("VALIDATOR_QUORUM_NOT_MET");
    expect(fixture.profile.evidenceRequiredFor).toContain("release_settlement");
  });

  for (const scenario of fixture.cases) {
    it(scenario.name, () => {
      const result = harness.evaluate(scenario);
      expect(result).toMatchObject(scenario.expected);
    });
  }
});
