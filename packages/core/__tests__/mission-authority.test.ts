import { describe, expect, it } from "vitest";
import {
  checkMissionManifestAttenuation,
  computeMissionManifestPolicyPayload,
  evaluateMissionAuthority,
  missionManifestSchema,
  type MissionActionProposal,
  type MissionManifest,
  type OperatorAuthorization,
} from "../src/index.js";

const UUID_A = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const UUID_B = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8";
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const KEY_C = "c".repeat(64);
const SIGNATURE = "d".repeat(128);
const HASH = "e".repeat(64);

function manifest(overrides: Partial<MissionManifest> = {}): MissionManifest {
  return {
    manifestId: UUID_A,
    protocolVersion: "0.3.0",
    manifestVersion: 1,
    issuer: KEY_A,
    platformId: "px4-air-01",
    platformIdentity: KEY_B,
    missionClass: "operator_supervised_effects",
    validFrom: "2026-06-06T10:00:00.000000Z",
    validUntil: "2026-06-06T12:00:00.000000Z",
    resources: ["mavlink://vehicle/1/effects"],
    actions: ["execute"],
    effectConstraints: [{
      effectId: "effect-1",
      effectType: "kinetic",
      resource: "mavlink://vehicle/1/effects",
      actions: ["execute"],
      maxUses: 1,
      operatorAuthorizationRequired: true,
      minimumApprovalQuorum: 2,
    }],
    approvalPolicy: {
      minimumQuorum: 2,
      authorizedOperatorIds: [KEY_A, KEY_C],
      authorizationMaxAgeMs: 60_000,
    },
    abortConditions: [
      { conditionId: "abort-estop", signal: "estop", response: "terminate" },
      {
        conditionId: "abort-revoked",
        signal: "authority_revoked",
        response: "return_to_safe_state",
      },
      {
        conditionId: "abort-comms",
        signal: "communications_lost",
        response: "hold",
      },
    ],
    maxDelegationDepth: 2,
    delegationDepth: 0,
    policyHash: HASH,
    signature: SIGNATURE,
    ...overrides,
  };
}

function authorization(
  operatorId: string,
  overrides: Partial<OperatorAuthorization> = {},
): OperatorAuthorization {
  return {
    authorizationId: operatorId === KEY_A ? UUID_A : UUID_B,
    manifestId: UUID_A,
    actionRef: "action-1",
    operatorId,
    decision: "approve",
    issuedAt: "2026-06-06T10:29:30.000000Z",
    expiresAt: "2026-06-06T10:31:00.000000Z",
    signature: SIGNATURE,
    ...overrides,
  };
}

function proposal(
  overrides: Partial<MissionActionProposal> = {},
): MissionActionProposal {
  return {
    actionRef: "action-1",
    platformId: "px4-air-01",
    platformIdentity: KEY_B,
    resource: "mavlink://vehicle/1/effects",
    action: "execute",
    proposedAt: "2026-06-06T10:30:00.000000Z",
    effectId: "effect-1",
    communicationsAvailable: true,
    autonomyCompromised: false,
    authorityRevoked: false,
    operatorAuthorizations: [],
    ...overrides,
  };
}

describe("Mission Authority", () => {
  it("computes a stable policy payload without hash or signature", () => {
    const payload = computeMissionManifestPolicyPayload(manifest());
    expect(payload).not.toContain(HASH);
    expect(payload).not.toContain(SIGNATURE);
    expect(payload).toContain('"platformId":"px4-air-01"');
  });

  it("rejects a kinetic effect schema without operator authority", () => {
    const invalid = manifest({
      effectConstraints: [{
        effectId: "effect-1",
        effectType: "kinetic",
        resource: "mavlink://vehicle/1/effects",
        actions: ["execute"],
        maxUses: 1,
        operatorAuthorizationRequired: false,
        minimumApprovalQuorum: 0,
      }],
    });
    expect(missionManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it("escalates until distinct operator quorum is present", () => {
    const pending = evaluateMissionAuthority({
      manifest: manifest(),
      proposal: proposal(),
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    });
    expect(pending.action).toBe("escalate");
    expect(pending.reasonCode).toBe("OPERATOR_AUTHORIZATION_REQUIRED");

    const allowed = evaluateMissionAuthority({
      manifest: manifest(),
      proposal: proposal({
        operatorAuthorizations: [authorization(KEY_A), authorization(KEY_C)],
      }),
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    });
    expect(allowed.action).toBe("allow");
    expect(allowed.observedApprovalCount).toBe(2);
  });

  it("denies expired, wrong-platform, revoked, and compromised proposals", () => {
    expect(evaluateMissionAuthority({
      manifest: manifest(),
      proposal: proposal(),
      evaluatedAt: "2026-06-06T12:00:00.000000Z",
    }).reasonCode).toBe("MANIFEST_EXPIRED");

    expect(evaluateMissionAuthority({
      manifest: manifest(),
      proposal: proposal({ platformId: "other-platform" }),
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    }).reasonCode).toBe("WRONG_PLATFORM");

    const revoked = evaluateMissionAuthority({
      manifest: manifest(),
      proposal: proposal({ authorityRevoked: true }),
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    });
    expect(revoked.reasonCode).toBe("AUTHORITY_REVOKED");
    expect(revoked.abortResponse).toBe("return_to_safe_state");

    expect(evaluateMissionAuthority({
      manifest: manifest(),
      proposal: proposal({ autonomyCompromised: true }),
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    }).reasonCode).toBe("AUTONOMY_COMPROMISED");
  });

  it("applies explicit communications-loss behavior", () => {
    const decision = evaluateMissionAuthority({
      manifest: manifest(),
      proposal: proposal({ communicationsAvailable: false }),
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    });
    expect(decision.action).toBe("deny");
    expect(decision.abortResponse).toBe("hold");
  });

  it("rejects mission delegation that broadens authority", () => {
    const parent = manifest();
    const narrowed = manifest({
      manifestId: UUID_B,
      manifestVersion: 2,
      parentManifestId: UUID_A,
      delegationDepth: 1,
      validFrom: "2026-06-06T10:15:00.000000Z",
      validUntil: "2026-06-06T11:00:00.000000Z",
      effectConstraints: [{
        ...parent.effectConstraints[0]!,
        maxUses: 1,
        minimumApprovalQuorum: 3,
      }],
      approvalPolicy: {
        ...parent.approvalPolicy,
        minimumQuorum: 3,
        authorizationMaxAgeMs: 30_000,
      },
    });
    expect(checkMissionManifestAttenuation(parent, narrowed).ok).toBe(true);

    const foreignIssuer = checkMissionManifestAttenuation(parent, {
      ...narrowed,
      issuer: KEY_C,
    });
    expect(foreignIssuer.ok).toBe(false);
    if (!foreignIssuer.ok) {
      expect(foreignIssuer.error).toContain("ISSUER_CHANGED");
    }

    const rollback = checkMissionManifestAttenuation(parent, {
      ...narrowed,
      manifestVersion: parent.manifestVersion,
    });
    expect(rollback.ok).toBe(false);
    if (!rollback.ok) {
      expect(rollback.error).toContain("MANIFEST_VERSION_NOT_INCREASED");
    }

    const expanded = {
      ...narrowed,
      resources: [...narrowed.resources, "mavlink://vehicle/1/admin"],
    };
    const result = checkMissionManifestAttenuation(parent, expanded);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("RESOURCE_SCOPE_EXPANDED");
    }
  });
});
