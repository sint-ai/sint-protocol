import { describe, expect, it, vi } from "vitest";
import {
  ApprovalTier,
  ok,
  type SintCapabilityToken,
  type SintCapabilityTokenRequest,
} from "@pshkv/core";
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
  type DispatchEnvelopePayload,
  type EffectPackPayload,
  type LocalAdmissionPolicy,
  type SignedDispatchEnvelope,
  type SignedEffectPack,
} from "../src/index.js";

function isoFromNow(milliseconds: number): string {
  return new Date(Date.now() + milliseconds)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

const packAuthority = generateKeypair();
const gatewayAuthority = generateKeypair();
const tokenAuthority = generateKeypair();
const agent = generateKeypair();

function issueToken(
  overrides: Partial<SintCapabilityTokenRequest> = {},
): SintCapabilityToken {
  const result = issueCapabilityToken({
    issuer: tokenAuthority.publicKey,
    subject: agent.publicKey,
    resource: "ros2:///cmd_vel",
    actions: ["publish"],
    constraints: { maxVelocityMps: 0.5 },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: isoFromNow(60_000),
    revocable: true,
    ...overrides,
  }, tokenAuthority.privateKey);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function makePack(
  overrides: Partial<EffectPackPayload> = {},
): SignedEffectPack {
  const result = createSignedEffectPack({
    schemaVersion: "sint-effect-pack/1",
    packId: "warehouse.motion",
    version: "1.0.0",
    issuedAt: nowISO8601(),
    expiresAt: isoFromNow(60_000),
    issuer: packAuthority.publicKey,
    effects: [{
      effectId: "motion.set-velocity",
      resource: "ros2:///cmd_vel",
      action: "publish",
      minimumTier: ApprovalTier.T2_ACT,
      effectClass: "physical-motion",
      parameters: {
        velocityMps: { type: "number", required: true, min: 0, max: 1 },
        mode: {
          type: "string",
          required: true,
          enum: ["controlled", "precision"],
        },
      },
      maxDurationMs: 1_000,
      maxOutputBytes: 32,
      secretPatterns: ["token=[A-Za-z0-9]+"],
      physicalBindings: { velocityParameter: "velocityMps" },
    }],
    ...overrides,
  }, packAuthority.privateKey);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function makeDispatch(
  pack: SignedEffectPack,
  overrides: Partial<DispatchEnvelopePayload> = {},
): SignedDispatchEnvelope {
  const result = createSignedDispatchEnvelope({
    schemaVersion: "sint-dispatch/1",
    dispatchId: generateUUIDv7(),
    requestId: generateUUIDv7(),
    actionRef: `action:${generateUUIDv7()}`,
    runnerId: "edge-cell-7",
    packId: pack.packId,
    packDigest: pack.digest,
    effectId: "motion.set-velocity",
    params: { velocityMps: 0.3, mode: "controlled" },
    capabilityToken: issueToken(),
    authorization: {
      decision: "allow",
      assignedTier: ApprovalTier.T2_ACT,
      policyEventHash: hashSha256("policy-event"),
      approvalEventHash: hashSha256("approval-event"),
    },
    physicalContext: { commandedVelocityMps: 0.3 },
    issuedAt: nowISO8601(),
    expiresAt: isoFromNow(10_000),
    nonce: "unique-nonce-1234567890",
    signer: gatewayAuthority.publicKey,
    ...overrides,
  }, gatewayAuthority.privateKey);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function admission(
  overrides: Partial<LocalAdmissionPolicy> = {},
): LocalAdmissionPolicy {
  return {
    trustedPackIssuers: [packAuthority.publicKey],
    trustedDispatchSigners: [gatewayAuthority.publicKey],
    trustedCapabilityIssuers: [tokenAuthority.publicKey],
    requireApprovalEvidenceFor: [ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT],
    ...overrides,
  };
}

describe("SintEdgeRunner", () => {
  it("executes a fully verified effect and sanitizes output before returning it", async () => {
    const pack = makePack();
    const dispatch = makeDispatch(pack);
    const executor = vi.fn(() => ok({
      status: "completed" as const,
      output: "token=secret123 operation completed with extra diagnostic text",
    }));
    const runner = new SintEdgeRunner({
      runnerId: "edge-cell-7",
      admission: admission({ allowedPackDigests: [pack.digest] }),
      executor,
    });

    const result = await runner.run(pack, dispatch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).not.toContain("secret123");
    expect(result.value.redactionCount).toBe(1);
    expect(result.value.outputTruncated).toBe(true);
    expect(executor).toHaveBeenCalledOnce();
    expect(runner.journal.getAll().map((entry) => entry.event)).toEqual([
      "dispatch.accepted",
      "effect.started",
      "effect.completed",
    ]);
    expect(runner.journal.verify()).toBe(true);
    expect(result.value.journalHead).toBe(runner.journal.headHash);
  });

  it("rejects a pack whose signed content was changed", async () => {
    const pack = makePack();
    const dispatch = makeDispatch(pack);
    const runner = new SintEdgeRunner({
      runnerId: "edge-cell-7",
      admission: admission(),
      executor: () => ok({ status: "completed" }),
    });

    const result = await runner.run({
      ...pack,
      effects: [{ ...pack.effects[0]!, maxDurationMs: 2_000 }],
    }, dispatch);

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_PACK", reason: "effect pack digest mismatch" },
    });
  });

  it("binds each dispatch to one runner and rejects replay", async () => {
    const pack = makePack();
    const dispatch = makeDispatch(pack);
    const executor = vi.fn(() => ok({ status: "completed" as const }));
    const runner = new SintEdgeRunner({
      runnerId: "edge-cell-7",
      admission: admission(),
      executor,
    });

    const first = await runner.run(pack, dispatch);
    const replay = await runner.run(pack, dispatch);
    const wrongRunner = await new SintEdgeRunner({
      runnerId: "edge-cell-8",
      admission: admission(),
      executor,
    }).run(pack, dispatch);

    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({ ok: false, error: { code: "REPLAY_DETECTED" } });
    expect(wrongRunner).toMatchObject({ ok: false, error: { code: "WRONG_RUNNER" } });
    expect(executor).toHaveBeenCalledOnce();
  });

  it("enforces local deny policy after valid central authorization", async () => {
    const pack = makePack();
    const dispatch = makeDispatch(pack);
    const executor = vi.fn(() => ok({ status: "completed" as const }));
    const runner = new SintEdgeRunner({
      runnerId: "edge-cell-7",
      admission: admission({ deniedEffectIds: ["motion.set-velocity"] }),
      executor,
    });

    const result = await runner.run(pack, dispatch);

    expect(result).toMatchObject({ ok: false, error: { code: "LOCAL_POLICY_DENIED" } });
    expect(executor).not.toHaveBeenCalled();
  });

  it("requires approval evidence for locally configured strong tiers", async () => {
    const pack = makePack();
    const dispatch = makeDispatch(pack, {
      authorization: {
        decision: "allow",
        assignedTier: ApprovalTier.T2_ACT,
        policyEventHash: hashSha256("policy-event"),
      },
    });
    const runner = new SintEdgeRunner({
      runnerId: "edge-cell-7",
      admission: admission(),
      executor: () => ok({ status: "completed" }),
    });

    const result = await runner.run(pack, dispatch);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "APPROVAL_EVIDENCE_REQUIRED" },
    });
  });

  it("rejects undeclared parameters before execution", async () => {
    const pack = makePack();
    const dispatch = makeDispatch(pack, {
      params: { velocityMps: 0.3, mode: "controlled", rawCommand: "override" },
    });
    const executor = vi.fn(() => ok({ status: "completed" as const }));
    const runner = new SintEdgeRunner({
      runnerId: "edge-cell-7",
      admission: admission(),
      executor,
    });

    const result = await runner.run(pack, dispatch);

    expect(result).toMatchObject({ ok: false, error: { code: "PARAMETER_REJECTED" } });
    expect(executor).not.toHaveBeenCalled();
  });

  it("revalidates token-bound physical limits at the edge", async () => {
    const pack = makePack();
    const dispatch = makeDispatch(pack, {
      params: { velocityMps: 0.8, mode: "controlled" },
      physicalContext: { commandedVelocityMps: 0.1 },
    });
    const executor = vi.fn(() => ok({ status: "completed" as const }));
    const runner = new SintEdgeRunner({
      runnerId: "edge-cell-7",
      admission: admission(),
      executor,
    });

    const result = await runner.run(pack, dispatch);

    expect(result).toMatchObject({ ok: false, error: { code: "CAPABILITY_REJECTED" } });
    expect(executor).not.toHaveBeenCalled();
  });
});
