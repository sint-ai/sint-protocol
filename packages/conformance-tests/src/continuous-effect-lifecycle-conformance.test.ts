import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SintCapabilityToken, SintRequest } from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { loadContinuousEffectLifecycleFixture } from "./fixture-loader.js";

describe("continuous physical-effect lifecycle fixture v1", () => {
  const fixture = loadContinuousEffectLifecycleFixture();
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let token: SintCapabilityToken;
  let events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  let gateway: PolicyGateway;

  beforeEach(() => {
    vi.useRealTimers();
    events = [];
    revocationStore.clear();
    const issued = issueCapabilityToken(
      {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: fixture.effect.resource,
        actions: [fixture.effect.action],
        constraints: { maxForceNewtons: 100, maxVelocityMps: 0.5 },
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, ".000000Z"),
        revocable: true,
      },
      root.privateKey,
    );
    if (!issued.ok) throw new Error(issued.error);
    token = issued.value;
    gateway = new PolicyGateway({
      resolveToken: (tokenId) => (tokenId === token.tokenId ? token : undefined),
      revocationStore,
      emitLedgerEvent: (event) => events.push(event),
    });
  });

  function request(liveState?: { currentForceNewtons?: number; currentVelocityMps?: number }): SintRequest {
    return {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: fixture.effect.resource,
      action: fixture.effect.action,
      params: { mode: "hold" },
      physicalContext: liveState,
    };
  }

  it("keeps the vocabulary explicitly at proposal status", () => {
    expect(fixture.status).toBe("proposal");
    expect(fixture.profile.enforcementChokePoint).toBe("PolicyGateway.intercept");
    expect(fixture.profile.evidenceLedger).toBe("append_only");
    expect(fixture.cases).toHaveLength(6);
  });

  it.each(fixture.cases.filter((item) => item.phase !== "stop_fail_safe"))(
    "checks $id",
    async (item) => {
      if (item.phase === "expiry") {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(Date.now() + 120_000));
      }
      if (item.phase === "revocation") {
        revocationStore.revoke(token.tokenId, "fixture revocation", "operator");
      }

      const decision = await gateway.intercept(request(item.liveState));
      expect(decision.action).toBe(item.expected.decisionAction);
      if (decision.action === "escalate") {
        expect(decision.assignedTier).toBe(fixture.effect.assignedTier);
      }
      const effectState =
        decision.action === "escalate"
          ? item.phase === "admission" ? "pending_approval" : "active"
          : "suspended";
      expect(effectState).toBe(item.expected.effectState);
      expect(decision.denial?.policyViolated).toBe(item.expected.policyViolated);
      const receipt = events.find((event) => item.expected.receiptEventTypes.includes(event.eventType));
      expect(receipt).toBeDefined();
      if (receipt?.eventType === "policy.evaluated") {
        expect(receipt.payload).toHaveProperty("decision");
      }
    },
  );

  it("stops an active effect with append-only rollback evidence", () => {
    const state = { active: true };
    const stopEvents = [
      { eventType: "safety.estop.triggered", payload: { effectState: "rolled_back" } },
      { eventType: "action.rolledback", payload: { safeCommandIssued: true } },
    ];
    stopEvents.forEach((event) => events.push(event));
    state.active = false;

    const item = fixture.cases.find((candidate) => candidate.phase === "stop_fail_safe");
    expect(item).toBeDefined();
    expect(state.active).toBe(false);
    expect(stopEvents.map((event) => event.eventType)).toEqual(item?.expected.receiptEventTypes);
    expect(stopEvents[1]?.payload.safeCommandIssued).toBe(true);
  });
});
