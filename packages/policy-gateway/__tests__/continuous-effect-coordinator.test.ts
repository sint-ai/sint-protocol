import { describe, expect, it, vi } from "vitest";
import type { PolicyDecision, SintRequest } from "@pshkv/core";
import { generateUUIDv7 } from "@pshkv/gate-capability-tokens";
import { ContinuousEffectCoordinator, PolicyGateway } from "../src/index.js";

const request: SintRequest = {
  requestId: generateUUIDv7(),
  timestamp: "2026-09-11T00:00:00.000000Z",
  agentId: "agent-1",
  tokenId: generateUUIDv7(),
  resource: "ros2:///gripper/left",
  action: "publish",
  params: { force: 40 },
};

const escalated: PolicyDecision = {
  requestId: request.requestId,
  timestamp: request.timestamp,
  action: "escalate",
  assignedTier: "T2_act",
  assignedRisk: "T2_stateful",
  escalation: {
    requiredTier: "T2_act",
    reason: "approval required",
    timeoutMs: 30_000,
    fallbackAction: "deny",
  },
};

const allowed: PolicyDecision = {
  requestId: request.requestId,
  timestamp: request.timestamp,
  action: "allow",
  assignedTier: "T2_act",
  assignedRisk: "T2_stateful",
};

const denied: PolicyDecision = {
  requestId: request.requestId,
  timestamp: request.timestamp,
  action: "deny",
  assignedTier: "T3_commit",
  assignedRisk: "T3_irreversible",
  denial: { reason: "force exceeded", policyViolated: "CONSTRAINT_VIOLATION" },
};

describe("ContinuousEffectCoordinator", () => {
  it("creates a pending lease from a gateway escalation and activates after approval", async () => {
    const gateway = new PolicyGateway({ resolveToken: () => undefined });
    vi.spyOn(gateway, "intercept").mockResolvedValue(escalated);
    const coordinator = new ContinuousEffectCoordinator(gateway, { stopEffect: vi.fn() });

    const admitted = await coordinator.admit(request);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    expect(admitted.value.lease.state).toBe("PENDING_APPROVAL");
    expect(coordinator.approve(admitted.value.lease.leaseId)).toEqual({
      ok: true,
      value: { ...admitted.value.lease, state: "ACTIVE" },
    });
  });

  it("renews only after another gateway decision and stops on denial", async () => {
    const gateway = new PolicyGateway({ resolveToken: () => undefined });
    const intercept = vi.spyOn(gateway, "intercept")
      .mockResolvedValueOnce(allowed)
      .mockResolvedValueOnce(denied);
    const stopEffect = vi.fn();
    const events: Array<{ eventType: string }> = [];
    const coordinator = new ContinuousEffectCoordinator(gateway, {
      stopEffect,
      emitLedgerEvent: (event) => events.push({ eventType: event.eventType }),
    });

    const admitted = await coordinator.admit(request);
    if (!admitted.ok) throw new Error("admission should succeed");
    const renewed = await coordinator.renew(admitted.value.lease.leaseId, request);

    expect(intercept).toHaveBeenCalledTimes(2);
    expect(renewed).toMatchObject({ ok: false, error: { code: "RENEWAL_DENIED" } });
    expect(stopEffect).toHaveBeenCalledOnce();
    expect(events.map((event) => event.eventType)).toEqual([
      "safety.estop.triggered",
      "action.rolledback",
    ]);
    expect(coordinator.get(admitted.value.lease.leaseId)?.state).toBe("ROLLEDBACK");
  });

  it("rejects renewal with a different resource binding", async () => {
    const gateway = new PolicyGateway({ resolveToken: () => undefined });
    const intercept = vi.spyOn(gateway, "intercept").mockResolvedValue(allowed);
    const coordinator = new ContinuousEffectCoordinator(gateway, { stopEffect: vi.fn() });
    const admitted = await coordinator.admit(request);
    if (!admitted.ok) throw new Error("admission should succeed");

    const mismatch = await coordinator.renew(admitted.value.lease.leaseId, {
      ...request,
      resource: "ros2:///gripper/right",
    });
    expect(mismatch).toEqual({
      ok: false,
      error: { code: "REQUEST_MISMATCH", state: "ACTIVE" },
    });
    expect(intercept).toHaveBeenCalledOnce();
  });
});
