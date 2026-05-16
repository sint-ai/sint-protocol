/**
 * Humanoid multi-vendor fleet governance conformance.
 *
 * H4 makes the fleet-level contract executable: handoffs need receipts,
 * overlapping shared-zone claims fail closed, and equivalent physical intent
 * stays high-consequence across ROS 2, Open-RMF, OPC UA, and Sparkplug ingress.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { topicToResourceUri } from "@pshkv/bridge-ros2";
import {
  defaultTierForRmfOperation,
  rmfDispatchResourceUri,
  rmfOperationToAction,
  rmfFacilityResourceUri,
  type RmfOperation,
} from "@pshkv/bridge-open-rmf";
import {
  defaultTierForOpcUaOperation,
  opcUaNodeToResourceUri,
  opcUaOperationToAction,
  type OpcUaOperation,
} from "@pshkv/bridge-opcua";
import {
  defaultTierForSparkplug,
  sparkplugActionForMessageType,
  sparkplugTopicToResourceUri,
} from "@pshkv/bridge-mqtt-sparkplug";
import { loadHumanoidMultivendorFleetFixture } from "./fixture-loader.js";

interface ZoneClaim {
  readonly claimId: string;
  readonly robotId: string;
  readonly workspaceId: string;
  readonly window: {
    readonly start: string;
    readonly end: string;
  };
}

function overlaps(a: ZoneClaim["window"], b: ZoneClaim["window"]): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

function evaluateClaim(
  claim: ZoneClaim,
  acceptedClaims: readonly ZoneClaim[],
): { action: "allow" | "deny"; policyViolated?: "FLEET_ZONE_CONFLICT" } {
  const conflict = acceptedClaims.some(
    (accepted) =>
      accepted.workspaceId === claim.workspaceId &&
      accepted.robotId !== claim.robotId &&
      overlaps(accepted.window, claim.window),
  );

  return conflict
    ? { action: "deny", policyViolated: "FLEET_ZONE_CONFLICT" }
    : { action: "allow" };
}

describe("Humanoid multi-vendor fleet fixture v1", () => {
  const fixture = loadHumanoidMultivendorFleetFixture();

  it("declares the H4 fleet governance contract", () => {
    expect(fixture.fixtureId).toBe("humanoid-multivendor-fleet-v1");
    expect(fixture.deployment.robots.map((robot) => robot.kind)).toEqual([
      "humanoid",
      "amr",
      "conveyor",
    ]);
    expect(fixture.requirements).toEqual({
      handoffRequiresReceipt: true,
      sharedZoneConflictFailsClosed: true,
      crossBridgeReplayPreservesIntent: true,
      crossBridgeReplayPreservesHighConsequenceTier: true,
      dashboardQueriesDefinedForThousandRobotAudit: true,
    });
  });

  it("rejects handoff evidence that lacks an auditable receipt", () => {
    const receipt = fixture.handoffReceiptSchema.sample;
    for (const field of fixture.handoffReceiptSchema.requiredFields) {
      expect(receipt, field).toHaveProperty(field);
      expect(receipt[field], field).not.toBeUndefined();
    }

    const withoutReceipt = { ...receipt, receiptId: undefined };
    const hasRequiredReceipt = fixture.handoffReceiptSchema.requiredFields.every(
      (field) => withoutReceipt[field] !== undefined,
    );
    expect(hasRequiredReceipt).toBe(false);
  });

  it("denies conflicting shared-zone claims fail-closed", () => {
    const accepted: ZoneClaim[] = [];

    for (const claim of fixture.sharedZoneClaims) {
      const decision = evaluateClaim(claim, accepted);
      expect(decision.action, claim.claimId).toBe(claim.expectedDecision);
      expect(claim.expectedTier, claim.claimId).toBe("T1_prepare");

      if (decision.action === "allow") {
        accepted.push(claim);
      } else {
        expect(decision.policyViolated).toBe(claim.policyViolated);
      }
    }

    expect(accepted.map((claim) => claim.claimId)).toEqual([
      "claim-digit-07-a17",
      "claim-amr-17-b02",
    ]);
  });

  it("preserves equivalent high-consequence tiering across bridge replay paths", () => {
    for (const path of fixture.crossBridgeReplay.paths) {
      if (path.bridge === "ros2") {
        expect(topicToResourceUri(path.mapperInput.topic)).toBe(path.resource);
        expect(path.action).toBe("publish");
        expect(fixture.crossBridgeReplay.expectedAssignedTier).toBe(ApprovalTier.T2_ACT);
      }

      if (path.bridge === "open-rmf") {
        const operation = path.mapperInput.operation as RmfOperation;
        expect(rmfDispatchResourceUri(path.mapperInput.fleetName)).toBe(path.resource);
        expect(rmfOperationToAction(operation)).toBe(path.action);
        expect(defaultTierForRmfOperation(operation)).toBe(ApprovalTier.T2_ACT);
      }

      if (path.bridge === "opcua") {
        const operation = path.mapperInput.operation as OpcUaOperation;
        expect(opcUaNodeToResourceUri(path.mapperInput.nodeId, path.mapperInput.endpoint)).toBe(
          path.resource,
        );
        expect(opcUaOperationToAction(operation)).toBe(path.action);
        expect(defaultTierForOpcUaOperation(operation, path.mapperInput.nodeId)).toBe(
          ApprovalTier.T2_ACT,
        );
      }

      if (path.bridge === "sparkplug") {
        expect(sparkplugTopicToResourceUri(path.mapperInput.topic)).toBe(path.resource);
        expect(sparkplugActionForMessageType(path.mapperInput.messageType)).toBe(path.action);
        expect(defaultTierForSparkplug(path.mapperInput.messageType)).toBe(ApprovalTier.T2_ACT);
      }
    }
  });

  it("maps Open-RMF shared-zone reservations into T1 prepare claims", () => {
    const zoneClaim = fixture.sharedZoneClaims.find(
      (claim) => claim.claimId === "claim-amr-17-a17-conflict",
    );
    expect(zoneClaim).toBeDefined();
    expect(rmfFacilityResourceUri(fixture.deployment.siteId, "zone", "zone-aisle-a17")).toBe(
      zoneClaim?.resource,
    );
    expect(zoneClaim?.action).toBe("prepare");
    expect(zoneClaim?.expectedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("defines bounded audit queries for 1,000+ robot dashboard review", () => {
    expect(fixture.dashboardAuditQueries.map((query) => query.name)).toEqual([
      "high_consequence_by_robot",
      "workspace_conflicts_by_zone",
      "handoff_receipts_by_payload",
      "estop_and_rollback_by_fleet",
    ]);

    for (const query of fixture.dashboardAuditQueries) {
      expect(query.requiredFilters.length, query.name).toBeGreaterThanOrEqual(3);
      expect(query.requiredFilters, query.name).toContain("timestampRange");
    }
  });
});
