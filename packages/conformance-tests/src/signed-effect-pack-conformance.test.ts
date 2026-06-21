import { describe, expect, it, vi } from "vitest";
import { ApprovalTier, ok } from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  hashSha256,
  issueCapabilityToken,
  nowISO8601,
} from "@pshkv/gate-capability-tokens";
import {
  createSignedDispatchEnvelope,
  createSignedEffectPack,
  SintEdgeRunner,
} from "@pshkv/sint-edge-agent";

function futureIso(): string {
  return new Date(Date.now() + 60_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Signed Effect Pack Conformance", () => {
  const packAuthority = generateKeypair();
  const gatewayAuthority = generateKeypair();
  const tokenAuthority = generateKeypair();
  const agent = generateKeypair();

  function fixture() {
    const token = issueCapabilityToken({
      issuer: tokenAuthority.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 0.4 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureIso(),
      revocable: true,
    }, tokenAuthority.privateKey);
    expect(token.ok).toBe(true);
    if (!token.ok) throw new Error(token.error);

    const pack = createSignedEffectPack({
      schemaVersion: "sint-effect-pack/1",
      packId: "conformance.motion",
      version: "1.0.0",
      issuedAt: nowISO8601(),
      issuer: packAuthority.publicKey,
      effects: [{
        effectId: "motion.command",
        resource: "ros2:///cmd_vel",
        action: "publish",
        minimumTier: ApprovalTier.T2_ACT,
        effectClass: "physical-motion",
        parameters: {
          velocityMps: { type: "number", required: true, min: 0, max: 0.8 },
        },
        maxDurationMs: 500,
        maxOutputBytes: 128,
        physicalBindings: { velocityParameter: "velocityMps" },
      }],
    }, packAuthority.privateKey);
    expect(pack.ok).toBe(true);
    if (!pack.ok) throw new Error(pack.error);

    const dispatch = createSignedDispatchEnvelope({
      schemaVersion: "sint-dispatch/1",
      dispatchId: generateUUIDv7(),
      requestId: generateUUIDv7(),
      actionRef: `conformance:${generateUUIDv7()}`,
      runnerId: "runner-a",
      packId: pack.value.packId,
      packDigest: pack.value.digest,
      effectId: "motion.command",
      params: { velocityMps: 0.3 },
      capabilityToken: token.value,
      authorization: {
        decision: "allow",
        assignedTier: ApprovalTier.T2_ACT,
        policyEventHash: hashSha256("policy"),
        approvalEventHash: hashSha256("approval"),
      },
      physicalContext: { commandedVelocityMps: 0.3 },
      issuedAt: nowISO8601(),
      expiresAt: futureIso(),
      nonce: "conformance-nonce-0001",
      signer: gatewayAuthority.publicKey,
    }, gatewayAuthority.privateKey);
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) throw new Error(dispatch.error);

    return { pack: pack.value, dispatch: dispatch.value };
  }

  function runner(executor = vi.fn(() => ok({ status: "completed" as const }))) {
    return {
      executor,
      value: new SintEdgeRunner({
        runnerId: "runner-a",
        admission: {
          trustedPackIssuers: [packAuthority.publicKey],
          trustedDispatchSigners: [gatewayAuthority.publicKey],
          trustedCapabilityIssuers: [tokenAuthority.publicKey],
          requireApprovalEvidenceFor: [ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT],
        },
        executor,
      }),
    };
  }

  it("I-E1: changed pack bytes must block execution", async () => {
    const { pack, dispatch } = fixture();
    const edge = runner();
    const result = await edge.value.run({
      ...pack,
      version: "1.0.1",
    }, dispatch);

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_PACK" } });
    expect(edge.executor).not.toHaveBeenCalled();
  });

  it("I-E2: a dispatch is single-use and runner-bound", async () => {
    const { pack, dispatch } = fixture();
    const edge = runner();

    expect((await edge.value.run(pack, dispatch)).ok).toBe(true);
    expect(await edge.value.run(pack, dispatch)).toMatchObject({
      ok: false,
      error: { code: "REPLAY_DETECTED" },
    });
  });

  it("I-E3: token physical limits are rechecked immediately before execution", async () => {
    const { pack, dispatch } = fixture();
    const { signature: _signature, ...payload } = dispatch;
    const elevated = createSignedDispatchEnvelope({
      ...payload,
      params: { velocityMps: 0.7 },
      physicalContext: { commandedVelocityMps: 0.1 },
    }, gatewayAuthority.privateKey);
    expect(elevated.ok).toBe(true);
    if (!elevated.ok) return;
    const edge = runner();

    expect(await edge.value.run(pack, elevated.value)).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_REJECTED" },
    });
    expect(edge.executor).not.toHaveBeenCalled();
  });
});
