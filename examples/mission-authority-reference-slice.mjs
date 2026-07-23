import {
  ApprovalTier,
  computeMissionActionOutcomeSigningPayload,
  computeMissionManifestPolicyPayload,
  computeMissionManifestSigningPayload,
  computeOperatorAuthorizationSigningPayload,
  evaluateMissionAuthority,
  ok,
} from "../packages/core/dist/index.js";
import {
  generateKeypair,
  generateUUIDv7,
  hashSha256,
  issueCapabilityToken,
  nowISO8601,
  sign,
} from "../packages/capability-tokens/dist/index.js";
import { InMemoryMissionManifestStore } from "../packages/persistence/dist/index.js";
import {
  createSignedDispatchEnvelope,
  createSignedEffectPack,
  SintEdgeRunner,
} from "../packages/sint-edge-agent/dist/index.js";

function isoFromNow(milliseconds) {
  return new Date(Date.now() + milliseconds)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function printStep(title, value) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(value, null, 2));
}

function signedManifest({
  issuer,
  platform,
  operatorA,
  operatorB,
  validUntil = isoFromNow(3_600_000),
}) {
  const policy = {
    manifestId: generateUUIDv7(),
    protocolVersion: "0.3.0",
    manifestVersion: 1,
    issuer: issuer.publicKey,
    platformId: "ros2-ground-reference-01",
    platformIdentity: platform.publicKey,
    missionClass: "logistics",
    validFrom: nowISO8601(),
    validUntil,
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
      authorizedOperatorIds: [operatorA.publicKey, operatorB.publicKey],
      authorizationMaxAgeMs: 60_000,
    },
    abortConditions: [
      { conditionId: "estop", signal: "estop", response: "terminate" },
      { conditionId: "comms", signal: "communications_lost", response: "return_to_safe_state" },
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
      issuer.privateKey,
      computeMissionManifestSigningPayload(withHash),
    ),
  };
}

function signedOperatorAuthorization({
  manifest,
  actionRef,
  operator,
}) {
  const authorization = {
    authorizationId: generateUUIDv7(),
    manifestId: manifest.manifestId,
    actionRef,
    operatorId: operator.publicKey,
    decision: "approve",
    issuedAt: nowISO8601(),
    expiresAt: isoFromNow(60_000),
  };
  return {
    ...authorization,
    signature: sign(
      operator.privateKey,
      computeOperatorAuthorizationSigningPayload(authorization),
    ),
  };
}

async function main() {
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
  const stored = await store.store(manifest);

  const actionRef = `reference:${generateUUIDv7()}`;
  const operatorAuthorizations = [
    signedOperatorAuthorization({ manifest, actionRef, operator: operatorA }),
    signedOperatorAuthorization({ manifest, actionRef, operator: operatorB }),
  ];
  const proposal = {
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
  if (decision.action !== "allow") {
    throw new Error(`Mission authority did not allow reference action: ${decision.reasonCode}`);
  }

  const claim = await store.claimAction({
    actionRef,
    manifestId: manifest.manifestId,
    effectId: proposal.effectId,
    claimedAt: nowISO8601(),
  }, manifest.effectConstraints[0].maxUses);
  if (claim.status !== "claimed") {
    throw new Error(`Action claim failed: ${claim.status}`);
  }

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
  if (!token.ok) throw new Error(token.error);

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
  if (!pack.ok) throw new Error(pack.error);

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
  if (!dispatch.ok) throw new Error(dispatch.error);

  const runner = new SintEdgeRunner({
    runnerId: "edge-reference-runner",
    admission: {
      trustedPackIssuers: [packIssuer.publicKey],
      trustedDispatchSigners: [gatewaySigner.publicKey],
      trustedCapabilityIssuers: [tokenIssuer.publicKey],
      allowedPackDigests: [pack.value.digest],
      requireApprovalEvidenceFor: [ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT],
    },
    executor: () => ok({
      status: "completed",
      output: "synthetic actuator accepted velocity command",
      metrics: { commandedVelocityMps: 0.3 },
    }),
  });

  const receipt = await runner.run(pack.value, dispatch.value);
  if (!receipt.ok) throw new Error(receipt.error.reason);

  const outcome = {
    actionRef,
    manifestId: manifest.manifestId,
    platformIdentity: platform.publicKey,
    outcome: "completed",
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
  const finalized = await store.finalizeAction(signedOutcome);
  if (finalized.status !== "finalized") {
    throw new Error(`Outcome finalization failed: ${finalized.status}`);
  }

  console.log("SINT Mission Authority reference slice");
  console.log("Command: pnpm run build && pnpm run demo:mission-authority-reference");
  printStep("1. Manifest registered", {
    status: stored.status,
    manifestId: manifest.manifestId,
    policyHash: manifest.policyHash,
  });
  printStep("2. Authority decision", decision);
  printStep("3. Edge receipt", {
    dispatchId: receipt.value.dispatchId,
    status: receipt.value.status,
    journalHead: receipt.value.journalHead,
  });
  printStep("4. Terminal outcome", {
    status: finalized.status,
    actionRef: signedOutcome.actionRef,
    detailsDigest: signedOutcome.detailsDigest,
  });
}

await main();
