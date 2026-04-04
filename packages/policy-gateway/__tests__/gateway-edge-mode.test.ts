/**
 * SINT PolicyGateway — edge mode control-plane tests.
 */

import { describe, expect, it, vi } from "vitest";
import { PolicyGateway, type EdgeControlPlanePlugin } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import type { SintCapabilityToken, SintCapabilityTokenRequest, SintRequest } from "@sint/core";

function futureISO(hoursFromNow = 2): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeRequest(
  overrides: Partial<SintRequest> & { tokenId: string; agentId: string },
): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
    ...overrides,
  };
}

describe("PolicyGateway Edge Control Plane", () => {
  const root = generateKeypair();
  const agent = generateKeypair();

  function issueToken(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const token = issueCapabilityToken(
      {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: "ros2:///cmd_vel",
        actions: ["publish"],
        constraints: {
          maxVelocityMps: 0.6,
        },
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(),
        revocable: true,
        ...overrides,
      },
      root.privateKey,
    );
    if (!token.ok) {
      throw new Error(`Token issuance failed: ${token.error}`);
    }
    return token.value;
  }

  it("allows local T1 requests while central is offline", async () => {
    const token = issueToken({
      resource: "ros2:///plan",
      actions: ["publish"],
    });
    const gateSpy = vi.fn().mockResolvedValue({ allowed: false, reason: "central offline" });
    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: gateSpy,
    };

    const gateway = new PolicyGateway({
      resolveToken: () => token,
      edgeControlPlane: edgeControl,
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///plan",
        action: "publish",
      }),
    );

    expect(decision.action).toBe("allow");
    expect(gateSpy).not.toHaveBeenCalled();
  });

  it("fails closed for T2 escalation when central control plane is unavailable", async () => {
    const token = issueToken();
    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: vi.fn().mockResolvedValue({
        allowed: false,
        reason: "central approval cluster unreachable",
      }),
    };

    const gateway = new PolicyGateway({
      resolveToken: () => token,
      edgeControlPlane: edgeControl,
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("EDGE_CENTRAL_UNAVAILABLE");
  });

  it("attaches token quorum to escalation decision", async () => {
    const token = issueToken({
      constraints: {
        maxVelocityMps: 0.6,
        quorum: {
          required: 2,
          authorized: ["op-alice", "op-bob", "op-carol"],
        },
      },
    });
    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: vi.fn().mockResolvedValue({ allowed: true }),
    };

    const gateway = new PolicyGateway({
      resolveToken: () => token,
      edgeControlPlane: edgeControl,
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.escalation?.approvalQuorum).toEqual({
      required: 2,
      authorized: ["op-alice", "op-bob", "op-carol"],
    });
  });

  it("relays revocation observations through edge hook", async () => {
    const token = issueToken();
    const revocationStore = new RevocationStore();
    revocationStore.revoke(token.tokenId, "safety lockout", "operator-7");

    const relaySpy = vi.fn();
    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: vi.fn().mockResolvedValue({ allowed: true }),
      relayRevocation: relaySpy,
    };

    const gateway = new PolicyGateway({
      resolveToken: () => token,
      revocationStore,
      edgeControlPlane: edgeControl,
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("TOKEN_REVOKED");
    expect(relaySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: token.tokenId,
        reason: "safety lockout",
      }),
    );
  });

  it("replicates evidence events through edge hook", async () => {
    const token = issueToken({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
    });

    const replicateSpy = vi.fn();
    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: vi.fn().mockResolvedValue({ allowed: true }),
      replicateEvidenceEvent: replicateSpy,
    };

    const gateway = new PolicyGateway({
      resolveToken: () => token,
      edgeControlPlane: edgeControl,
    });

    await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
      }),
    );

    expect(replicateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "policy.evaluated",
        tokenId: token.tokenId,
      }),
    );
  });
});
