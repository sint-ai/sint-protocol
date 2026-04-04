/**
 * SINT Protocol — PolicyGateway unit tests.
 *
 * Tests the single choke point through which every agent action flows.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import type { SintCapabilityToken, SintCapabilityTokenRequest, SintRequest } from "@sint/core";
import { ApprovalTier } from "@sint/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
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

describe("PolicyGateway", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let ledger: LedgerWriter;
  let emitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    ledger = new LedgerWriter();

    emitSpy = vi.fn((event: any) => {
      ledger.append({
        eventType: event.eventType as any,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
    });

    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
    });
  });

  function issueAndStore(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        maxForceNewtons: 50,
        maxVelocityMps: 0.5,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  // ── T0: Sensor subscribe → auto-allow ──

  it("allows T0 sensor subscribe requests", async () => {
    const token = issueAndStore({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
      }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  // ── T1: Navigation plan → auto-allow with audit ──

  it("allows T1 plan publish requests", async () => {
    const token = issueAndStore({
      resource: "ros2:///plan",
      actions: ["publish"],
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
    expect(decision.assignedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  // ── T2: cmd_vel publish → escalate ──

  it("escalates T2 cmd_vel publish requests", async () => {
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision.escalation?.fallbackAction).toBe("deny");
  });

  // ── T3: mode_change → escalate with safe-stop ──

  it("escalates T3 mode_change with safe-stop fallback", async () => {
    const token = issueAndStore({
      resource: "ros2:///mode_change",
      actions: ["call"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///mode_change",
        action: "call",
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(decision.escalation?.fallbackAction).toBe("safe-stop");
  });

  // ── Token not found → deny ──

  it("denies request with non-existent token", async () => {
    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: "01905f7c-0000-7000-8000-000000000000",
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("TOKEN_NOT_FOUND");
  });

  // ── Revoked token → deny ──

  it("denies request with revoked token", async () => {
    const token = issueAndStore();
    revocationStore.revoke(token.tokenId, "Security incident", "admin");

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("TOKEN_REVOKED");
  });

  // ── Wrong resource → deny ──

  it("denies request for unauthorized resource", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///mode_change",
        action: "call",
      }),
    );

    expect(decision.action).toBe("deny");
  });

  // ── Force violation → deny ──

  it("denies request exceeding force constraint", async () => {
    const token = issueAndStore({
      constraints: { maxForceNewtons: 50 },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        params: { force: 75 },
      }),
    );

    expect(decision.action).toBe("deny");
  });

  it("denies request when preapproved corridor does not match token execution envelope", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "corridor-a",
        expiresAt: futureISO(1),
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          preapprovedCorridor: {
            corridorId: "corridor-b",
            expiresAt: futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });

  // ── Forbidden combo → escalate ──

  it("escalates on forbidden tool combination", async () => {
    // Token that allows exec.run on an MCP resource
    const token = issueAndStore({
      resource: "mcp://server/exec",
      actions: ["exec.run"],
    });

    // "filesystem.write" followed by "exec.run" is a forbidden combo
    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "mcp://server/exec",
        action: "exec.run",
        recentActions: ["filesystem.write"],
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.escalation?.requiredTier).toBe(ApprovalTier.T3_COMMIT);
  });

  // ── Ledger events ──

  it("emits ledger event for every evaluated request", async () => {
    const token = issueAndStore({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
      }),
    );

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "policy.evaluated",
        agentId: agent.publicKey,
      }),
    );
  });

  // ── No revocation store → skip check ──

  it("works without revocation store configured", async () => {
    const noRevokeGateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
    });

    const token = issueAndStore({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    const decision = await noRevokeGateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
      }),
    );

    expect(decision.action).toBe("allow");
  });
});
