import { describe, expect, it } from "vitest";
import {
  checkMissionManifestAttenuation,
  computeMissionManifestPolicyPayload,
  evaluateMissionAuthority,
  type MissionActionProposal,
  type MissionManifest,
} from "@pshkv/core";
import { hashSha256 } from "@pshkv/gate-capability-tokens";

const MANIFEST_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const ISSUER = "a".repeat(64);
const OPERATOR = "b".repeat(64);
const SIGNATURE = "c".repeat(128);
const HASH = "d".repeat(64);

function manifest(
  platformId: string,
  platformIdentity: string,
  resource: string,
): MissionManifest {
  return {
    manifestId: MANIFEST_ID,
    protocolVersion: "0.3.0",
    manifestVersion: 1,
    issuer: ISSUER,
    platformId,
    platformIdentity,
    missionClass: "logistics",
    validFrom: "2026-06-06T10:00:00.000000Z",
    validUntil: "2026-06-06T12:00:00.000000Z",
    resources: [resource],
    actions: ["navigate"],
    effectConstraints: [],
    approvalPolicy: {
      minimumQuorum: 0,
      authorizedOperatorIds: [OPERATOR],
      authorizationMaxAgeMs: 60_000,
    },
    abortConditions: [
      { conditionId: "estop", signal: "estop", response: "terminate" },
      {
        conditionId: "comms",
        signal: "communications_lost",
        response: "return_to_safe_state",
      },
      {
        conditionId: "compromised",
        signal: "autonomy_compromised",
        response: "hold",
      },
    ],
    maxDelegationDepth: 1,
    delegationDepth: 0,
    policyHash: HASH,
    signature: SIGNATURE,
  };
}

function proposal(
  platformId: string,
  platformIdentity: string,
  resource: string,
): MissionActionProposal {
  return {
    actionRef: `${platformId}-action-1`,
    platformId,
    platformIdentity,
    resource,
    action: "navigate",
    proposedAt: "2026-06-06T10:30:00.000000Z",
    communicationsAvailable: true,
    autonomyCompromised: false,
    authorityRevoked: false,
    operatorAuthorizations: [],
  };
}

describe("Mission Authority heterogeneous fleet conformance", () => {
  it("commits every authority-bearing field to the policy hash", () => {
    const base = manifest(
      "px4-air-01",
      "1".repeat(64),
      "mavlink://vehicle/1/mission",
    );
    const originalHash = hashSha256(computeMissionManifestPolicyPayload(base));
    const expandedHash = hashSha256(computeMissionManifestPolicyPayload({
      ...base,
      resources: [...base.resources, "mavlink://vehicle/1/admin"],
    }));

    expect(originalHash).not.toBe(expandedHash);
  });

  it("requires every delegated manifest to attenuate parent authority", () => {
    const parent = manifest(
      "px4-air-01",
      "1".repeat(64),
      "mavlink://vehicle/1/mission",
    );
    const child: MissionManifest = {
      ...parent,
      manifestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8",
      manifestVersion: 2,
      parentManifestId: parent.manifestId,
      delegationDepth: 1,
      validFrom: "2026-06-06T10:15:00.000000Z",
      validUntil: "2026-06-06T11:00:00.000000Z",
    };
    expect(checkMissionManifestAttenuation(parent, child).ok).toBe(true);

    const foreignIssuer = checkMissionManifestAttenuation(parent, {
      ...child,
      issuer: "f".repeat(64),
    });
    expect(foreignIssuer.ok).toBe(false);
    if (!foreignIssuer.ok) {
      expect(foreignIssuer.error).toContain("ISSUER_CHANGED");
    }

    const expanded = {
      ...child,
      actions: [...child.actions, "admin"],
    };
    const result = checkMissionManifestAttenuation(parent, expanded);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ACTION_SCOPE_EXPANDED");
    }
  });

  it("applies the same authority contract to PX4 and ROS 2 platforms", () => {
    const cases = [
      {
        manifest: manifest("px4-air-01", "1".repeat(64), "mavlink://vehicle/1/mission"),
        proposal: proposal("px4-air-01", "1".repeat(64), "mavlink://vehicle/1/mission"),
      },
      {
        manifest: manifest("ros2-ground-01", "2".repeat(64), "ros2:///nav2/navigate_to_pose"),
        proposal: proposal("ros2-ground-01", "2".repeat(64), "ros2:///nav2/navigate_to_pose"),
      },
    ];

    for (const testCase of cases) {
      expect(evaluateMissionAuthority({
        ...testCase,
        evaluatedAt: "2026-06-06T10:30:00.000000Z",
      }).action).toBe("allow");
    }
  });

  it("fails closed for compromised autonomy and communications loss", () => {
    const mission = manifest(
      "px4-air-01",
      "1".repeat(64),
      "mavlink://vehicle/1/mission",
    );
    const base = proposal(
      "px4-air-01",
      "1".repeat(64),
      "mavlink://vehicle/1/mission",
    );

    const compromised = evaluateMissionAuthority({
      manifest: mission,
      proposal: { ...base, autonomyCompromised: true },
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    });
    expect(compromised.action).toBe("deny");
    expect(compromised.abortResponse).toBe("hold");

    const disconnected = evaluateMissionAuthority({
      manifest: mission,
      proposal: { ...base, communicationsAvailable: false },
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    });
    expect(disconnected.action).toBe("deny");
    expect(disconnected.abortResponse).toBe("return_to_safe_state");
  });
});
