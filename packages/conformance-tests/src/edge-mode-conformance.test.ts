/**
 * SINT edge-mode conformance.
 *
 * Validates local T0/T1 behavior and fail-closed T2/T3 behavior when
 * central approval is unavailable.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway, type EdgeControlPlanePlugin } from "@pshkv/gate-policy-gateway";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Edge Mode Conformance", () => {
  const root = generateKeypair();
  const agent = generateKeypair();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let centralOnline = false;

  function issueAndStore(
    overrides: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
      ...overrides,
    };
    const issued = issueCapabilityToken(req, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }
    tokenStore.set(issued.value.tokenId, issued.value);
    return issued.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    centralOnline = false;

    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: async () => ({
        allowed: centralOnline,
        reason: centralOnline ? undefined : "central approval control plane offline",
      }),
    };

    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      edgeControlPlane: edgeControl,
    });
  });

  it("offline mode allows local T0/T1 but denies T2/T3 fail-open risk", async () => {
    const observeToken = issueAndStore({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });
    const actToken = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });

    const observeDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: observeToken.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    });
    expect(observeDecision.action).toBe("allow");

    const actDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: actToken.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.1 } },
      physicalContext: { currentVelocityMps: 0.1 },
    });
    expect(actDecision.action).toBe("deny");
    expect(actDecision.denial?.policyViolated).toBe("EDGE_CENTRAL_UNAVAILABLE");
  });

  it("reconnect reconciliation restores central escalation path", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });

    const offlineDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.1 } },
      physicalContext: { currentVelocityMps: 0.1 },
    });
    expect(offlineDecision.action).toBe("deny");
    expect(offlineDecision.denial?.policyViolated).toBe("EDGE_CENTRAL_UNAVAILABLE");

    centralOnline = true;

    const onlineDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.1 } },
      physicalContext: { currentVelocityMps: 0.1 },
    });
    expect(onlineDecision.action).toBe("escalate");
  });
});

