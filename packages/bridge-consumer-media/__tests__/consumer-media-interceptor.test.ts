import { describe, expect, it, vi } from "vitest";
import { ApprovalTier, type PolicyDecision } from "@pshkv/core";
import { ConsumerMediaInterceptor, toConsumerMediaResource } from "../src/index.js";

const session = { householdId: "home-1", roomId: "living-room", deviceId: "tv-1", agentId: "agent", tokenId: "01905f7c-4e8b-7000-8000-000000000001" };
const allow: PolicyDecision = { action: "allow", assignedTier: ApprovalTier.T2_ACT, requestId: "id", timestamp: "2026-01-01T00:00:00.000000Z", assignedRisk: "T2_stateful" };

describe("ConsumerMediaInterceptor", () => {
  it("binds egress authority to an explicit recipient resource and routes it through the gateway", async () => {
    const intercept = vi.fn(async () => allow);
    const result = await new ConsumerMediaInterceptor({ intercept }).intercept(session, { operation: "upload", recipient: "api.example.com", dataClass: "acr-fingerprint", purpose: "recommendations" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("forward");
    expect(result.value.resource).toBe("tv://home-1/living-room/tv-1/egress/api.example.com");
    expect(intercept).toHaveBeenCalledOnce();
    expect(intercept.mock.calls[0]?.[0].executionContext?.deploymentProfile).toBe("home-media-private");
  });

  it("requires a recipient for egress and a data class for sensor operations", () => {
    expect(toConsumerMediaResource(session, { operation: "upload" })).toMatchObject({ ok: false, error: { message: "upload requires a recipient" } });
    expect(toConsumerMediaResource(session, { operation: "collect" })).toMatchObject({ ok: false, error: { message: "collect requires a dataClass" } });
  });

  it("models continuation and stop as named effect-lifecycle operations", () => {
    expect(toConsumerMediaResource(session, { operation: "renew", effectId: "capture-42" }))
      .toEqual({ ok: true, value: "tv://home-1/living-room/tv-1/effect/capture-42" });
    expect(toConsumerMediaResource(session, { operation: "stop", effectId: "capture-42" }))
      .toEqual({ ok: true, value: "tv://home-1/living-room/tv-1/effect/capture-42" });
    expect(toConsumerMediaResource(session, { operation: "stop" })).toMatchObject({ ok: false, error: { message: "stop requires an effectId" } });
  });

  it("returns an input error for malformed resources without invoking authorization", async () => {
    const intercept = vi.fn(async () => allow);
    const bridge = new ConsumerMediaInterceptor({ intercept });
    for (const invalid of [
      { operation: "upload", recipient: "../other" },
      { operation: "upload", recipient: ".." },
      { operation: "unknown", dataClass: "raw-frame" },
      { operation: "collect", dataClass: "unknown" },
    ]) {
      expect(await bridge.intercept(session, invalid as never)).toMatchObject({ ok: false, error: { code: "INVALID_MEDIA_REQUEST" } });
    }
    expect(intercept).not.toHaveBeenCalled();
  });
});
