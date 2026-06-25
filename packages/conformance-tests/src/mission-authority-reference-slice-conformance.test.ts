import { describe, expect, it, vi } from "vitest";
import {
  ApprovalTier,
  computeMissionActionOutcomeSigningPayload,
  computeMissionManifestPolicyPayload,
  computeMissionManifestSigningPayload,
  computeOperatorAuthorizationSigningPayload,
  evaluateMissionAuthority,
  ok,
  type MissionActionProposal,
  type MissionManifest,
  type OperatorAuthorization,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  hashSha256,
  issueCapabilityToken,
  nowISO8601,
  sign,
} from "@pshkv/gate-capability-tokens";
import { InMemoryMissionManifestStore } from "@pshkv/persistence";
import {
  createSignedDispatchEnvelope,
  createSignedEffectPack,
  SintEdgeRunner,
} from "@pshkv/sint-edge-agent";

function isoFromNow(milliseconds: number): string {
  return new Date(Date.now() + milliseconds)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function signedManifest(params: {
  readonly issuer: ReturnType<typeof generateKeypair>;
  readonly platform: ReturnType<typeof generateKeypair>;
  readonly operatorA: ReturnType<typeof generateKeypair>;
  readonly operatorB: ReturnType<typeof generateKeypair>;
}): MissionManifest {
  const policy: Omit<MissionManifest, "policyHash" | "signature"> = {
    manifestId: generateUUIDv7(),
    protocolVersion: "0.3.0",
    manifestVersion: 1,
    issuer: params.issuer.publicKey,
    platformId: "ros2-ground-reference-01",
    platformIdentity: params.platform.publicKey,
    missionClass: "logistics",
    validFrom: nowISO8601(),
    validUntil: isoFromNow(3_600_000),
    resources: ["ros2:///cmd_vel"],
    actions: ["publish"],
    effectConstraints: [{
      effectId: "motion.set-velocity",
      effectType: "non_kinetic",
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      maxUses: 1,
      operatorAuthorizationRequired: true,
      minimumApprovalQuorum: 2,
    }],
    approvalPolicy: {
      minimumQuorum: 2,
      authorizedOperatorIds: [
        params.operatorA.publicKey,
        params.operatorB.publicKey,
      ],
      authorizationMaxAgeMs: 60_000,
    },
    abortConditions: [
      { conditionId: "estop", signal: "estop", response: "terminate" },
      {
        conditionId: "comms",
        signal: "communications_lost",
        response: "return_to_safe_state",
      },
      { conditionId: "compromised", signal: "autonomy_compromised", response: "hold" },
    ],
    maxDelegationDepth: 1,
    delegationDepth: 0,
  };
  const withHash = {
    ...policy,
    policyHash: hashSha256(computeMissionManifestPolicyPayload(policy)),
  };
  return {
    ...withHash,
    signature: sign(
      params.issuer.privateKey,
      computeMissionManifestSigningPayload(withHash),
    ),
  };
}

function signedAuthorization(params: {
  readonly manifest: MissionManifest;
  readonly actionRef: string;
  readonly operator: ReturnType<typeof generateKeypair>;
}): OperatorAuthorization {
  const authorization: Omit<OperatorAuthorization, "signature"> = {
    authorizationId: generateUUIDv7(),
    manifestId: params.manifest.manifestId,
    actionRef: params.actionRef,
    operatorId: params.operator.publicKey,
    decision: "approve",
    issuedAt: nowISO8601(),
    expiresAt: isoFromNow(60_000),
  };
  return {
    ...authorization,
    signature: sign(
      params.operator.privateKey,
      computeOperatorAuthorizationSigningPayload(authorization),
    ),
  };
}

describe("Mission Authority reference slice conformance", () => {
  it("runs register, evaluate, claim, dispatch, edge execution, and outcome finalization", async () => {
    const missionIssuer = generateKeypair();
    const platform = generateKeypair();
    const operatorA = generateKeypair();
    const operatorB = generateKeypair();
    const tokenIssuer = generateKeypair();
    const packIssuer = generateKeypair();
    const gatewaySigner = generateKeypair();
    const store = new InMemoryMissionManifestStore();

    const manifest = signedManifest({
      issuer: missionIssuer,
      platform,
      operatorA,
      operatorB,
    });
    await expect(store.store(manifest)).resolves.toMatchObject({
      status: "stored",
    });

    const actionRef = `reference:${generateUUIDv7()}`;
    const operatorAuthorizations = [
      signedAuthorization({ manifest, actionRef, operator: operatorA }),
      signedAuthorization({ manifest, actionRef, operator: operatorB }),
    ];
    const proposal: MissionActionProposal = {
      actionRef,
      platformId: manifest.platformId,
      platformIdentity: platform.publicKey,
      resource: "ros2:///cmd_vel",
      action: "publish",
      proposedAt: nowISO8601(),
      effectId: "motion.set-velocity",
      communicationsAvailable: true,
      autonomyCompromised: false,
      authorityRevoked: false,
      operatorAuthorizations,
    };

    const decision = evaluateMissionAuthority({
      manifest,
      proposal,
      evaluatedAt: nowISO8601(),
    });
    expect(decision).toMatchObject({
      action: "allow",
      observedApprovalCount: 2,
      requiredApprovalQuorum: 2,
    });

    await expect(store.claimAction({
      actionRef,
      manifestId: manifest.manifestId,
      effectId: proposal.effectId,
      claimedAt: nowISO8601(),
    }, manifest.effectConstraints[0]!.maxUses)).resolves.toMatchObject({
      status: "claimed",
    });
    await expect(store.claimAction({
      actionRef,
      manifestId: manifest.manifestId,
      effectId: proposal.effectId,
      claimedAt: nowISO8601(),
    }, manifest.effectConstraints[0]!.maxUses)).resolves.toMatchObject({
      status: "duplicate",
    });

    const token = issueCapabilityToken({
      issuer: tokenIssuer.publicKey,
      subject: platform.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 0.5 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: isoFromNow(60_000),
      revocable: true,
    }, tokenIssuer.privateKey);
    expect(token.ok).toBe(true);
    if (!token.ok) return;

    const pack = createSignedEffectPack({
      schemaVersion: "sint-effect-pack/1",
      packId: "reference.motion",
      version: "1.0.0",
      issuedAt: nowISO8601(),
      expiresAt: isoFromNow(60_000),
      issuer: packIssuer.publicKey,
      effects: [{
        effectId: "motion.set-velocity",
        resource: "ros2:///cmd_vel",
        action: "publish",
        minimumTier: ApprovalTier.T2_ACT,
        effectClass: "physical-motion",
        parameters: {
          velocityMps: { type: "number", required: true, min: 0, max: 0.5 },
        },
        maxDurationMs: 1_000,
        maxOutputBytes: 128,
        physicalBindings: { velocityParameter: "velocityMps" },
      }],
    }, packIssuer.privateKey);
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;

    const dispatch = createSignedDispatchEnvelope({
      schemaVersion: "sint-dispatch/1",
      dispatchId: generateUUIDv7(),
      requestId: generateUUIDv7(),
      actionRef,
      runnerId: "edge-reference-runner",
      packId: pack.value.packId,
      packDigest: pack.value.digest,
      effectId: "motion.set-velocity",
      params: { velocityMps: 0.3 },
      capabilityToken: token.value,
      authorization: {
        decision: "allow",
        assignedTier: ApprovalTier.T2_ACT,
        policyEventHash: hashSha256(JSON.stringify(decision)),
        approvalEventHash: hashSha256(JSON.stringify(operatorAuthorizations)),
      },
      physicalContext: { commandedVelocityMps: 0.3 },
      issuedAt: nowISO8601(),
      expiresAt: isoFromNow(10_000),
      nonce: `reference-${generateUUIDv7()}`,
      signer: gatewaySigner.publicKey,
    }, gatewaySigner.privateKey);
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;

    const executor = vi.fn(() => ok({
      status: "completed" as const,
      output: "synthetic actuator accepted velocity command",
      metrics: { commandedVelocityMps: 0.3 },
    }));
    const runner = new SintEdgeRunner({
      runnerId: "edge-reference-runner",
      admission: {
        trustedPackIssuers: [packIssuer.publicKey],
        trustedDispatchSigners: [gatewaySigner.publicKey],
        trustedCapabilityIssuers: [tokenIssuer.publicKey],
        allowedPackDigests: [pack.value.digest],
        requireApprovalEvidenceFor: [ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT],
      },
      executor,
    });

    const receipt = await runner.run(pack.value, dispatch.value);
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(executor).toHaveBeenCalledOnce();
    expect(runner.journal.verify()).toBe(true);

    const outcome = {
      actionRef,
      manifestId: manifest.manifestId,
      platformIdentity: platform.publicKey,
      outcome: "completed" as const,
      completedAt: nowISO8601(),
      detailsDigest: hashSha256(JSON.stringify(receipt.value)),
    };
    const signedOutcome = {
      ...outcome,
      signature: sign(
        platform.privateKey,
        computeMissionActionOutcomeSigningPayload(outcome),
      ),
    };
    await expect(store.finalizeAction(signedOutcome)).resolves.toMatchObject({
      status: "finalized",
    });
    await expect(store.finalizeAction(signedOutcome)).resolves.toMatchObject({
      status: "duplicate",
    });
  });
});
