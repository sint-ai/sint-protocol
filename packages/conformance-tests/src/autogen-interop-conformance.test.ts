/**
 * AutoGen interop conformance.
 *
 * Validates executable fixture behavior for:
 * - capability validation + policy callback path
 * - trust-signal-to-tier escalation matrix
 * - evidence event emission
 * - edge-mode fail-closed behavior on T2/T3 when central is offline
 */

import { describe, expect, it } from "vitest";
import type {
  AgentTrustLevel,
  ApprovalTier,
  PolicyDecision,
  SintCapabilityToken,
  SintCapabilityTokenRequest,
  SintRequest,
} from "@sint-ai/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
} from "@sint-ai/gate-capability-tokens";
import { PolicyGateway, type EdgeControlPlanePlugin } from "@sint-ai/gate-policy-gateway";
import { mapTrustLevelToApprovalTier, mergedTier } from "@sint-ai/bridge-economy";
import { loadAutogenCapabilityTrustFixture } from "./fixture-loader.js";

type TrustSignal = "unrestricted" | "low_risk" | "medium_risk" | "high_risk" | "blocked";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function toAgentTrustLevel(signal: TrustSignal): AgentTrustLevel {
  switch (signal) {
    case "high_risk":
      return "untrusted";
    case "medium_risk":
      return "provisional";
    case "low_risk":
      return "trusted";
    case "unrestricted":
      return "verified";
    case "blocked":
      return "untrusted";
  }
}

function escalateDecision(decision: PolicyDecision, nextTier: ApprovalTier): PolicyDecision {
  return {
    ...decision,
    action: "escalate",
    assignedTier: nextTier,
    escalation: {
      requiredTier: nextTier,
      reason: "Trust callback escalation",
      timeoutMs: 30_000,
      fallbackAction: "deny",
    },
  };
}

function blockedDecision(request: SintRequest): PolicyDecision {
  return {
    requestId: request.requestId,
    timestamp: nowISO8601(),
    action: "deny",
    denial: {
      reason: "Trust signal blocked execution",
      policyViolated: "TRUST_BLOCKED",
    },
    assignedTier: "T3_commit",
    assignedRisk: "T3_irreversible",
  };
}

describe("AutoGen Interop Conformance", () => {
  const fixture = loadAutogenCapabilityTrustFixture();
  const root = generateKeypair();
  const agent = generateKeypair();

  function issueToken(
    tokenStore: Map<string, SintCapabilityToken>,
    overrides: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: fixture.token.resource,
      actions: [...fixture.token.actions],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(6),
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

  function buildRequest(
    tokenId: string,
    resource: string,
    action: string,
    params?: Record<string, unknown>,
  ): SintRequest {
    return {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId,
      resource,
      action,
      params: params ?? {},
    };
  }

  function createHarness(options?: { centralOnline?: boolean; trustSignal?: TrustSignal }) {
    const tokenStore = new Map<string, SintCapabilityToken>();
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const centralOnline = options?.centralOnline ?? true;
    const trustSignal = options?.trustSignal ?? "unrestricted";

    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: async () => ({
        allowed: centralOnline,
        reason: centralOnline ? undefined : "central approval control plane offline",
      }),
    };

    const gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      edgeControlPlane: edgeControl,
      getAgentTrustLevel: () => toAgentTrustLevel(trustSignal),
      emitLedgerEvent: (event) => {
        events.push({ eventType: event.eventType, payload: event.payload });
      },
    });

    return { gateway, tokenStore, events };
  }

  async function evaluateWithAutogenHooks(
    gateway: PolicyGateway,
    request: SintRequest,
    trustSignal: TrustSignal,
    events: Array<{ eventType: string; payload: Record<string, unknown> }>,
  ): Promise<PolicyDecision> {
    // Hook 1: trust gate (pre-policy callback).
    if (trustSignal === "blocked") {
      events.push({
        eventType: "economy.trust.blocked",
        payload: {
          requestId: request.requestId,
          trustSignal,
        },
      });
      return blockedDecision(request);
    }

    // Hook 2: capability validation + base policy callback.
    const decision = await gateway.intercept(request);

    // Hook 3: trust->tier merge callback.
    const trustTier = mapTrustLevelToApprovalTier(trustSignal);
    if (!trustTier) {
      return blockedDecision(request);
    }
    const merged = mergedTier(decision.assignedTier, trustTier);
    events.push({
      eventType: "economy.trust.evaluated",
      payload: {
        requestId: request.requestId,
        trustSignal,
        baseTier: decision.assignedTier,
        trustTier,
        mergedTier: merged,
      },
    });
    if (merged !== decision.assignedTier && (decision.action === "allow" || decision.action === "escalate")) {
      return escalateDecision(decision, merged);
    }
    return decision;
  }

  it("equivalence scenarios match between direct gateway path and autogen callback path", async () => {
    const { gateway, tokenStore, events } = createHarness({ trustSignal: "unrestricted" });
    const token = issueToken(tokenStore, {});

    for (const scenario of fixture.equivalenceScenarios) {
      const request = buildRequest(
        token.tokenId,
        scenario.request.resource,
        scenario.request.action,
        scenario.request.params,
      );
      const direct = await gateway.intercept(request);
      const viaCallback = await evaluateWithAutogenHooks(
        gateway,
        request,
        scenario.trustSignal,
        events,
      );

      expect(viaCallback.assignedTier).toBe(direct.assignedTier);
      expect(viaCallback.action).toBe(direct.action);
      expect(viaCallback.assignedTier).toBe(scenario.expected.assignedTier);
      expect(viaCallback.action).toBe(scenario.expected.decisionAction);
      expect(events.some((e) => e.eventType === scenario.expected.expectedEvidenceEvent)).toBe(true);
    }
  });

  it("trust matrix fixture produces deterministic tier/action outcomes", async () => {
    for (const scenario of fixture.trustMatrix) {
      const { gateway, tokenStore, events } = createHarness({
        trustSignal: scenario.trustSignal,
      });
      const token = issueToken(tokenStore, {});
      const request = buildRequest(
        token.tokenId,
        scenario.request.resource,
        scenario.request.action,
        scenario.request.params,
      );

      const decision = await evaluateWithAutogenHooks(
        gateway,
        request,
        scenario.trustSignal,
        events,
      );
      expect(decision.assignedTier).toBe(scenario.expected.assignedTier);
      expect(decision.action).toBe(scenario.expected.decisionAction);
      if (scenario.expected.policyViolated) {
        expect(decision.denial?.policyViolated).toBe(scenario.expected.policyViolated);
      }
      if (scenario.expected.expectedEvidenceEvent) {
        expect(events.some((e) => e.eventType === scenario.expected.expectedEvidenceEvent)).toBe(true);
      }
    }
  });

  it("edge disconnect fixture denies trust-escalated T2/T3 actions fail-closed", async () => {
    const scenario = fixture.edgeFailClosedScenario;
    const { gateway, tokenStore, events } = createHarness({
      centralOnline: false,
      trustSignal: scenario.trustSignal,
    });
    const token = issueToken(tokenStore, {});
    const request = buildRequest(
      token.tokenId,
      scenario.request.resource,
      scenario.request.action,
      scenario.request.params,
    );
    const decision = await evaluateWithAutogenHooks(
      gateway,
      request,
      scenario.trustSignal,
      events,
    );

    expect(decision.assignedTier).toBe(scenario.expected.assignedTier);
    expect(decision.action).toBe(scenario.expected.decisionAction);
    expect(decision.denial?.policyViolated).toBe(scenario.expected.policyViolated);
    expect(events.some((e) => e.eventType === "economy.trust.evaluated")).toBe(true);
  });
});
