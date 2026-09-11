import { describe, expect, it } from "vitest";
import { transitionContinuousEffect } from "../src/types/continuous-effect.js";
import type { ContinuousEffectLease } from "../src/types/continuous-effect.js";

const lease: ContinuousEffectLease = {
  leaseId: "0198d8c0-0000-7000-8000-000000000001",
  actionRef: "sha256:effect",
  agentId: "agent",
  tokenId: "0198d8c0-0000-7000-8000-000000000002",
  resource: "ros2:///gripper/left",
  action: "publish",
  state: "PENDING_APPROVAL",
  admittedAt: "2026-09-11T00:00:00.000000Z",
  renewBy: "2026-09-11T00:00:05.000000Z",
  expiresAt: "2026-09-11T00:01:00.000000Z",
};

describe("continuous effect state machine", () => {
  it("requires approval before activation and permits renewal while active", () => {
    const approved = transitionContinuousEffect(lease, "approval_granted");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    const renewed = transitionContinuousEffect(approved.value, "renewed");
    expect(renewed).toEqual({ ok: true, value: { ...approved.value, state: "ACTIVE" } });
  });

  it.each(["expired", "revoked", "renewal_denied"] as const)(
    "suspends an active effect on %s",
    (event) => {
      const active = { ...lease, state: "ACTIVE" as const };
      expect(transitionContinuousEffect(active, event)).toEqual({
        ok: true,
        value: { ...active, state: "SUSPENDED" },
      });
    },
  );

  it("rolls back and rejects later renewal after a stop", () => {
    const active = { ...lease, state: "ACTIVE" as const };
    const stopped = transitionContinuousEffect(active, "stop_requested");
    expect(stopped).toEqual({ ok: true, value: { ...active, state: "ROLLEDBACK" } });
    if (!stopped.ok) return;

    expect(transitionContinuousEffect(stopped.value, "renewed")).toEqual({
      ok: false,
      error: { code: "INVALID_TRANSITION", state: "ROLLEDBACK", event: "renewed" },
    });
  });
});
