/**
 * SINT Protocol — PolicyGateway economy plugin integration tests.
 *
 * Tests the economyPlugin hooks added to PolicyGateway:
 * - preIntercept short-circuit on economy deny
 * - postIntercept billing on allow
 * - Fail-open on plugin errors
 * - Existing behavior unchanged without plugin
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import type { EconomyPluginHooks } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken, SintCapabilityTokenRequest, SintRequest, PolicyDecision } from "@pshkv/core";
import { ApprovalTier, RiskTier } from "@pshkv/core";

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
    resource: "ros2:///camera/front",
    action: "subscribe",
    params: {},
    ...overrides,
  };
}

function makeDenyDecision(policyViolated: string, reason: string): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString(),
    action: "deny",
    denial: { reason, policyViolated },
    assignedTier: ApprovalTier.T3_COMMIT,
    assignedRisk: RiskTier.T3_IRREVERSIBLE,
  };
}

describe("PolicyGateway — Economy Plugin", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let emitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    emitSpy = vi.fn();
  });

  function issueAndStore(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
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

  function makeGateway(economyPlugin?: EconomyPluginHooks): PolicyGateway {
    return new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      economyPlugin,
    });
  }

  // ── No plugin → existing behavior unchanged ──

  it("works identically without economy plugin", async () => {
    const gateway = makeGateway(undefined);
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("no plugin — emits standard ledger event only", async () => {
    const gateway = makeGateway(undefined);
    const token = issueAndStore();

    await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "policy.evaluated" }),
    );
  });

  it("no plugin — denied request has no economy hooks", async () => {
    const gateway = makeGateway(undefined);

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: "01905f7c-0000-7000-8000-000000000000",
      }),
    );

    expect(decision.action).toBe("deny");
  });

  // ── PreIntercept deny → short-circuits ──

  it("economy preIntercept deny short-circuits before tier assignment", async () => {
    const preInterceptSpy = vi.fn(async () =>
      makeDenyDecision("BUDGET_EXCEEDED", "Budget limit exceeded"),
    );
    const postInterceptSpy = vi.fn(async () => {});

    const gateway = makeGateway({
      preIntercept: preInterceptSpy,
      postIntercept: postInterceptSpy,
    });
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("BUDGET_EXCEEDED");
    expect(preInterceptSpy).toHaveBeenCalledTimes(1);
    // postIntercept should NOT be called when preIntercept denies
    expect(postInterceptSpy).not.toHaveBeenCalled();
  });

  it("economy preIntercept deny for insufficient balance", async () => {
    const gateway = makeGateway({
      preIntercept: async () =>
        makeDenyDecision("INSUFFICIENT_BALANCE", "Not enough tokens"),
      postIntercept: async () => {},
    });
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("INSUFFICIENT_BALANCE");
  });

  // ── PreIntercept proceed → normal flow ──

  it("economy preIntercept returning undefined lets gateway proceed", async () => {
    const postInterceptSpy = vi.fn(async () => {});

    const gateway = makeGateway({
      preIntercept: async () => undefined,
      postIntercept: postInterceptSpy,
    });
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
    // postIntercept called on allow
    expect(postInterceptSpy).toHaveBeenCalledTimes(1);
  });

  // ── PostIntercept billing ──

  it("postIntercept receives the allow decision", async () => {
    const postInterceptSpy = vi.fn(async () => {});

    const gateway = makeGateway({
      preIntercept: async () => undefined,
      postIntercept: postInterceptSpy,
    });
    const token = issueAndStore();

    await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(postInterceptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: agent.publicKey }),
      expect.objectContaining({ action: "allow" }),
    );
  });

  it("postIntercept is NOT called on deny", async () => {
    const postInterceptSpy = vi.fn(async () => {});

    const gateway = makeGateway({
      preIntercept: async () => undefined,
      postIntercept: postInterceptSpy,
    });

    // Request with non-existent token → deny before economy hook
    await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: "01905f7c-0000-7000-8000-000000000000",
      }),
    );

    expect(postInterceptSpy).not.toHaveBeenCalled();
  });

  // ── Fail-open ──

  it("preIntercept error → fail-open, normal gateway flow continues", async () => {
    const gateway = makeGateway({
      preIntercept: async () => {
        throw new Error("Economy service unreachable");
      },
      postIntercept: async () => {},
    });
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    // Should still allow — fail-open
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("postIntercept error → fail-open, decision still returned", async () => {
    const gateway = makeGateway({
      preIntercept: async () => undefined,
      postIntercept: async () => {
        throw new Error("Billing service down");
      },
    });
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    // Decision should still be allow despite billing failure
    expect(decision.action).toBe("allow");
  });

  // ── Economy deny emits ledger event ──

  it("economy deny emits ledger event with economy_plugin source", async () => {
    const gateway = makeGateway({
      preIntercept: async () =>
        makeDenyDecision("TRUST_BLOCKED", "Agent trust level: blocked"),
      postIntercept: async () => {},
    });
    const token = issueAndStore();

    await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    // Should emit a policy.evaluated event with economy_plugin source
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "policy.evaluated",
        payload: expect.objectContaining({ source: "economy_plugin" }),
      }),
    );
  });
});
