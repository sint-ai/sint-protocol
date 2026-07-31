/**
 * SINT code-as-policy robot-agent guard tests.
 */

import { describe, expect, it, vi } from "vitest";
import { ApprovalTier, type SintCapabilityToken, type SintRequest } from "@pshkv/core";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "../src/gateway.js";
import {
  DefaultCodeAsPolicyGuard,
  type CodeAsPolicyGuardPlugin,
} from "../src/code-as-policy-guard.js";

const root = generateKeypair();
const agent = generateKeypair();
const VALID_PROGRAM_DIGEST = `digest:sha256:${"1".repeat(64)}`;
const VALID_SKILL_DIGEST = `digest:sha256:${"2".repeat(64)}`;

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeToken(overrides: Partial<Parameters<typeof issueCapabilityToken>[0]> = {}): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "engine://system2/execute",
      actions: ["execute"],
      constraints: {
        maxVelocityMps: 0.2,
        maxForceNewtons: 80,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(),
      revocable: false,
      ...overrides,
    },
    root.privateKey,
  );
  if (!result.ok) throw new Error(`token issuance failed: ${result.error}`);
  return result.value;
}

let seq = 0;
function makeRequest(
  token: SintCapabilityToken,
  overrides: Partial<SintRequest> = {},
): SintRequest {
  const suffix = String(++seq).padStart(4, "0");
  return {
    requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e5${suffix}` as any,
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: token.resource,
    action: token.actions[0] ?? "execute",
    params: {
      codeAsPolicy: {
        programRef: "sint://program/code-policy/fold-shirt.py",
        programDigest: VALID_PROGRAM_DIGEST,
        approvedProgramDigest: VALID_PROGRAM_DIGEST,
        skillRef: "sint://skill/fold-grasp/v4",
        skillDigest: VALID_SKILL_DIGEST,
        approvedSkillDigest: VALID_SKILL_DIGEST,
        primitiveSetRef: "sint://primitive-set/manipulation-safe-v1",
        primitives: ["bounding_box", "detect_in_base", "preset", "approach_until", "reset_home"],
        robotIds: ["arm-left-01", "arm-right-01"],
        trialRef: "sint://trial/fold-shirt/001",
        trialIndex: 12,
        trialBudget: 100,
      },
    },
    ...overrides,
  };
}

function makeGuard() {
  return new DefaultCodeAsPolicyGuard({
    allowedPrimitives: ["bounding_box", "detect_in_base", "preset", "approach_until", "reset_home"],
    maxTrialBudget: 1_000,
  });
}

describe("DefaultCodeAsPolicyGuard", () => {
  it("verifies matching generated-program and skill digests", () => {
    const token = makeToken();
    const request = makeRequest(token);
    const result = makeGuard().verify(request, token);

    expect(result.verified).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.metadata?.programDigest).toBe(VALID_PROGRAM_DIGEST);
    expect(result.metadata?.skillDigest).toBe(VALID_SKILL_DIGEST);
  });

  it("requires metadata for code-as-policy resources", () => {
    const token = makeToken();
    const request = makeRequest(token, { params: {} });
    const result = makeGuard().verify(request, token);

    expect(result.verified).toBe(false);
    expect(result.severity).toBe("high");
    expect(result.violations).toContain("codeAsPolicy metadata is required for generated robot program requests");
  });

  it("detects program body mutation after approval", () => {
    const token = makeToken();
    const request = makeRequest(token, {
      params: {
        codeAsPolicy: {
          programDigest: `digest:sha256:${"3".repeat(64)}`,
          approvedProgramDigest: VALID_PROGRAM_DIGEST,
          primitives: ["bounding_box"],
        },
      },
    });

    const result = makeGuard().verify(request, token);

    expect(result.verified).toBe(false);
    expect(result.violations).toContain("programDigest does not match approvedProgramDigest");
  });

  it("detects skill mutation and unapproved primitive introduction", () => {
    const token = makeToken();
    const request = makeRequest(token, {
      params: {
        codeAsPolicy: {
          programDigest: VALID_PROGRAM_DIGEST,
          approvedProgramDigest: VALID_PROGRAM_DIGEST,
          skillRef: "sint://skill/fold-grasp/v4",
          skillDigest: `digest:sha256:${"4".repeat(64)}`,
          approvedSkillDigest: VALID_SKILL_DIGEST,
          primitives: ["bounding_box", "raw_joint_override"],
        },
      },
    });

    const result = makeGuard().verify(request, token);

    expect(result.verified).toBe(false);
    expect(result.violations).toContain("skillDigest does not match approvedSkillDigest");
    expect(result.violations).toContain("unapproved primitives: raw_joint_override");
  });

  it("detects trial budget exhaustion for autonomous data collection loops", () => {
    const token = makeToken();
    const request = makeRequest(token, {
      params: {
        codeAsPolicy: {
          programDigest: VALID_PROGRAM_DIGEST,
          primitives: ["bounding_box"],
          trialIndex: 101,
          trialBudget: 100,
        },
      },
    });

    const result = makeGuard().verify(request, token);

    expect(result.verified).toBe(false);
    expect(result.violations).toContain("trialIndex 101 exceeds trialBudget 100");
  });
});

describe("CodeAsPolicyGuard — Gateway integration", () => {
  it("denies mutated generated-program execution before tier decision", async () => {
    const token = makeToken();
    const tokenStore = new Map([[token.tokenId, token]]);
    const emitSpy = vi.fn();

    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      emitLedgerEvent: emitSpy,
      codeAsPolicyGuard: makeGuard(),
    });

    const decision = await gateway.intercept(
      makeRequest(token, {
        params: {
          codeAsPolicy: {
            programDigest: `digest:sha256:${"3".repeat(64)}`,
            approvedProgramDigest: VALID_PROGRAM_DIGEST,
            primitives: ["bounding_box"],
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");

    const guardEvent = emitSpy.mock.calls.find(
      (call) => call[0]?.eventType === "robot.code_policy.guard_violation",
    );
    expect(guardEvent).toBeDefined();
  });

  it("allows verified T1 generated-program staging through normal gateway flow", async () => {
    const token = makeToken({
      resource: "engine://system2/plan",
      actions: ["generate"],
      constraints: {},
    });
    const tokenStore = new Map([[token.tokenId, token]]);
    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      codeAsPolicyGuard: makeGuard(),
    });

    const decision = await gateway.intercept(
      makeRequest(token, {
        resource: "engine://system2/plan",
        action: "generate",
      }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("fails closed when guard throws", async () => {
    const token = makeToken();
    const tokenStore = new Map([[token.tokenId, token]]);
    const brokenGuard: CodeAsPolicyGuardPlugin = {
      verify: () => {
        throw new Error("guard unavailable");
      },
    };
    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      codeAsPolicyGuard: brokenGuard,
    });

    const decision = await gateway.intercept(makeRequest(token));

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CODE_AS_POLICY_GUARD_ERROR");
  });
});
