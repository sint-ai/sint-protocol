import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { EmergencyBypassProtocol } from "../src/emergency-bypass.js";

describe("EmergencyBypassProtocol", () => {
  it("creates a bypass token with a bounded context window", async () => {
    const fixedNow = new Date("2026-05-13T17:00:00.000Z");
    const protocol = new EmergencyBypassProtocol({
      now: () => fixedNow,
    });

    const token = await protocol.bypassTier(
      {
        actionId: "action-1",
        agentId: "did:key:z6MkAgent",
        resource: "robot://ward-7/door-lock",
        operation: "unlock",
        assignedTier: ApprovalTier.T3_COMMIT,
      },
      {
        triggerReason: "medical",
        summary: "Paramedic access required for fall response",
        initiatedBy: "oncall-supervisor",
      },
    );

    expect(token.actionId).toBe("action-1");
    expect(token.context.triggerReason).toBe("medical");
    expect(token.context.triggeredAt).toBe("2026-05-13T17:00:00.000000Z");
    expect(token.context.expiresAt).toBe("2026-05-13T18:00:00.000000Z");
    expect(token.bypassId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("caps duration to maxDurationMs", async () => {
    const fixedNow = new Date("2026-05-13T17:00:00.000Z");
    const protocol = new EmergencyBypassProtocol({
      now: () => fixedNow,
      maxDurationMs: 30_000,
    });

    const token = await protocol.bypassTier(
      {
        actionId: "action-2",
        agentId: "did:key:z6MkAgent",
        resource: "robot://factory-1/cell-a",
        operation: "estop-reset",
        assignedTier: ApprovalTier.T2_ACT,
      },
      {
        triggerReason: "security",
        summary: "Safe reset after false positive lockout",
        initiatedBy: "security-lead",
        durationMs: 120_000,
      },
    );

    expect(token.context.expiresAt).toBe("2026-05-13T17:00:30.000000Z");
  });

  it("writes a deterministic audit hash for a bypass token", async () => {
    const fixedNow = new Date("2026-05-13T17:00:00.000Z");
    const protocol = new EmergencyBypassProtocol({
      now: () => fixedNow,
    });

    const token = await protocol.bypassTier(
      {
        actionId: "action-3",
        agentId: "did:key:z6MkAgent",
        resource: "robot://ward-4/lift",
        operation: "priority-dispatch",
        assignedTier: ApprovalTier.T2_ACT,
      },
      {
        triggerReason: "fire",
        summary: "Evacuation routing override",
        initiatedBy: "facility-ops",
      },
    );

    const first = await protocol.logEmergencyBypass(token);
    const second = await protocol.logEmergencyBypass(token);

    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(first.eventType).toBe("emergency_bypass_issued");
  });
});

