/**
 * SINT Protocol — Spatial integrity policy tests.
 */

import { describe, expect, it, vi } from "vitest";
import {
  ApprovalTier,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "../src/gateway.js";
import { DefaultSpatialIntegrityPolicy } from "../src/spatial-integrity-policy.js";

const root = generateKeypair();
const agent = generateKeypair();

function isoOffset(ms: number): string {
  return new Date(Date.now() + ms)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeToken(): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        maxVelocityMps: 1.0,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: isoOffset(3_600_000),
      revocable: false,
    },
    root.privateKey,
  );
  if (!result.ok) throw new Error(`token issuance failed: ${result.error}`);
  return result.value;
}

function makeRequest(
  token: SintCapabilityToken,
  overrides: Partial<SintRequest> = {},
): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f000",
    timestamp: isoOffset(0),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: { velocity: 0.2 },
    physicalContext: {
      currentVelocityMps: 0.2,
      currentPosition: { x: 1, y: 2, z: 0 },
      frameId: "map:warehouse-a",
      localizationConfidence: 0.96,
      localizationObservedAt: isoOffset(0),
    },
    executionContext: {
      deploymentProfile: "gps-denied-indoor",
    },
    ...overrides,
  };
}

function makeGateway(token: SintCapabilityToken, emitLedgerEvent = vi.fn()) {
  return new PolicyGateway({
    resolveToken: () => token,
    emitLedgerEvent,
    spatialIntegrityPolicy: new DefaultSpatialIntegrityPolicy(),
  });
}

describe("DefaultSpatialIntegrityPolicy", () => {
  it("denies GPS-denied physical actions missing a localization frame", async () => {
    const token = makeToken();
    const gateway = makeGateway(token);

    const decision = await gateway.intercept(
      makeRequest(token, {
        physicalContext: {
          currentVelocityMps: 0.2,
          currentPosition: { x: 1, y: 2, z: 0 },
          localizationConfidence: 0.96,
          localizationObservedAt: isoOffset(0),
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_FRAME_REQUIRED");
  });

  it("denies stale localization evidence in GPS-denied deployments", async () => {
    const token = makeToken();
    const gateway = makeGateway(token);

    const decision = await gateway.intercept(
      makeRequest(token, {
        physicalContext: {
          currentVelocityMps: 0.2,
          currentPosition: { x: 1, y: 2, z: 0 },
          frameId: "map:warehouse-a",
          localizationConfidence: 0.96,
          localizationObservedAt: isoOffset(-5_000),
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_PROOF_STALE");
  });

  it("escalates degraded-but-usable localization below autonomous threshold", async () => {
    const token = makeToken();
    const emitLedgerEvent = vi.fn();
    const gateway = makeGateway(token, emitLedgerEvent);

    const decision = await gateway.intercept(
      makeRequest(token, {
        physicalContext: {
          currentVelocityMps: 0.2,
          currentPosition: { x: 1, y: 2, z: 0 },
          frameId: "map:warehouse-a",
          localizationConfidence: 0.82,
          localizationObservedAt: isoOffset(0),
        },
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision.escalation?.reason).toContain("below autonomous threshold");
    expect(
      emitLedgerEvent.mock.calls.some(
        (call) => call[0]?.payload?.source === "spatial_integrity_policy",
      ),
    ).toBe(true);
  });

  it("lets fresh high-confidence localization continue to normal tiering", async () => {
    const token = makeToken();
    const gateway = makeGateway(token);

    const decision = await gateway.intercept(makeRequest(token));

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision.escalation?.reason).toBe("Action requires human review (T2_act)");
  });

  it("does not block observe-only resources for the deployment profile", async () => {
    const result = issueCapabilityToken(
      {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: "ros2:///camera/front",
        actions: ["subscribe"],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: isoOffset(3_600_000),
        revocable: false,
      },
      root.privateKey,
    );
    if (!result.ok) throw new Error(`token issuance failed: ${result.error}`);
    const token = result.value;
    const gateway = makeGateway(token);

    const decision = await gateway.intercept(
      makeRequest(token, {
        resource: "ros2:///camera/front",
        action: "subscribe",
        params: {},
        physicalContext: undefined,
      }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });
});
