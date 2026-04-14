/**
 * SINT Protocol — ApprovalQueue unit tests.
 *
 * Tests the human approval queue for T2/T3 escalations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApprovalQueue } from "../src/approval-flow.js";
import type { ApprovalEvent } from "../src/approval-flow.js";
import { ApprovalTier, RiskTier } from "@pshkv/core";
import type { PolicyDecision, SintRequest } from "@pshkv/core";

function makeRequest(id = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7"): SintRequest {
  return {
    requestId: id,
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: "a".repeat(64),
    tokenId: "01905f7c-0000-7000-8000-000000000001",
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
  };
}

function makeDecision(overrides?: Partial<PolicyDecision>): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    action: "escalate",
    assignedTier: ApprovalTier.T2_ACT,
    assignedRisk: RiskTier.T2_STATEFUL,
    escalation: {
      requiredTier: ApprovalTier.T2_ACT,
      reason: "Physical actuator command",
      timeoutMs: 30_000,
      fallbackAction: "deny",
    },
    ...overrides,
  };
}

describe("ApprovalQueue", () => {
  let queue: ApprovalQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new ApprovalQueue({ defaultTimeoutMs: 5_000 });
  });

  afterEach(() => {
    queue.dispose();
    vi.useRealTimers();
  });

  // ── Enqueue ──

  it("enqueues a request and tracks it as pending", () => {
    const request = makeRequest();
    const decision = makeDecision();

    const approval = queue.enqueue(request, decision);

    expect(approval.requestId).toBe(request.requestId);
    expect(approval.request).toBe(request);
    expect(approval.decision).toBe(decision);
    expect(queue.size).toBe(1);
  });

  it("get() returns pending request by ID", () => {
    const request = makeRequest();
    queue.enqueue(request, makeDecision());

    const found = queue.get(request.requestId);
    expect(found).toBeDefined();
    expect(found!.requestId).toBe(request.requestId);
  });

  it("get() returns undefined for unknown ID", () => {
    expect(queue.get("unknown")).toBeUndefined();
  });

  it("getPending() returns all pending requests", () => {
    const r1 = makeRequest("01905f7c-0001-7000-8000-000000000001");
    const r2 = makeRequest("01905f7c-0002-7000-8000-000000000002");

    queue.enqueue(r1, makeDecision({ requestId: r1.requestId }));
    queue.enqueue(r2, makeDecision({ requestId: r2.requestId }));

    const pending = queue.getPending();
    expect(pending).toHaveLength(2);
  });

  // ── Resolve ──

  it("resolves a pending request as approved", () => {
    const request = makeRequest();
    queue.enqueue(request, makeDecision());

    const resolution = queue.resolve(request.requestId, {
      status: "approved",
      by: "operator-1",
    });

    expect(resolution).toBeDefined();
    expect(resolution!.status).toBe("approved");
    if (resolution!.status === "approved") {
      expect(resolution!.by).toBe("operator-1");
      expect(resolution!.at).toBeDefined();
    }
    expect(queue.size).toBe(0);
  });

  it("resolves a pending request as denied", () => {
    const request = makeRequest();
    queue.enqueue(request, makeDecision());

    const resolution = queue.resolve(request.requestId, {
      status: "denied",
      by: "operator-1",
      reason: "Too risky",
    });

    expect(resolution).toBeDefined();
    expect(resolution!.status).toBe("denied");
    if (resolution!.status === "denied") {
      expect(resolution!.reason).toBe("Too risky");
    }
    expect(queue.size).toBe(0);
  });

  it("returns undefined when resolving non-existent request", () => {
    const result = queue.resolve("not-real", { status: "approved", by: "op" });
    expect(result).toBeUndefined();
  });

  // ── Timeout ──

  it("auto-resolves with fallback on timeout", () => {
    const events: ApprovalEvent[] = [];
    queue.on((e) => events.push(e));

    const request = makeRequest();
    queue.enqueue(request, makeDecision());
    expect(queue.size).toBe(1);

    // Advance past the timeout
    vi.advanceTimersByTime(30_001);

    expect(queue.size).toBe(0);
    const timeoutEvent = events.find((e) => e.type === "timeout");
    expect(timeoutEvent).toBeDefined();
    expect(timeoutEvent!.type === "timeout" && timeoutEvent!.fallbackAction).toBe("deny");
  });

  it("uses safe-stop fallback for T3 escalations", () => {
    const events: ApprovalEvent[] = [];
    queue.on((e) => events.push(e));

    const request = makeRequest();
    const decision = makeDecision({
      assignedTier: ApprovalTier.T3_COMMIT,
      escalation: {
        requiredTier: ApprovalTier.T3_COMMIT,
        reason: "Irreversible action",
        timeoutMs: 10_000,
        fallbackAction: "safe-stop",
      },
    });
    queue.enqueue(request, decision);

    vi.advanceTimersByTime(10_001);

    const timeoutEvent = events.find((e) => e.type === "timeout");
    expect(timeoutEvent!.type === "timeout" && timeoutEvent!.fallbackAction).toBe("safe-stop");
  });

  it("cancels timeout timer on manual resolve", () => {
    const events: ApprovalEvent[] = [];
    queue.on((e) => events.push(e));

    const request = makeRequest();
    queue.enqueue(request, makeDecision());

    // Resolve before timeout
    queue.resolve(request.requestId, { status: "approved", by: "operator-1" });

    // Advance past when timeout would have fired
    vi.advanceTimersByTime(60_000);

    // No timeout event should have fired
    const timeoutEvents = events.filter((e) => e.type === "timeout");
    expect(timeoutEvents).toHaveLength(0);
  });

  // ── Events ──

  it("emits 'queued' event on enqueue", () => {
    const events: ApprovalEvent[] = [];
    queue.on((e) => events.push(e));

    const request = makeRequest();
    queue.enqueue(request, makeDecision());

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("queued");
  });

  it("emits 'resolved' event on resolve", () => {
    const events: ApprovalEvent[] = [];
    queue.on((e) => events.push(e));

    const request = makeRequest();
    queue.enqueue(request, makeDecision());
    queue.resolve(request.requestId, { status: "approved", by: "op" });

    const resolvedEvents = events.filter((e) => e.type === "resolved");
    expect(resolvedEvents).toHaveLength(1);
  });

  it("unsubscribe removes handler", () => {
    const events: ApprovalEvent[] = [];
    const unsub = queue.on((e) => events.push(e));

    const request = makeRequest();
    queue.enqueue(request, makeDecision());
    expect(events).toHaveLength(1);

    unsub();

    const r2 = makeRequest("01905f7c-0002-7000-8000-000000000002");
    queue.enqueue(r2, makeDecision({ requestId: r2.requestId }));
    // Should still be 1 because handler was removed
    expect(events).toHaveLength(1);
  });

  // ── Config defaults ──

  it("uses default timeout when decision has no escalation timeoutMs", () => {
    const shortQueue = new ApprovalQueue({ defaultTimeoutMs: 100 });
    const events: ApprovalEvent[] = [];
    shortQueue.on((e) => events.push(e));

    const request = makeRequest();
    const decision = makeDecision({
      escalation: undefined,
    });
    shortQueue.enqueue(request, decision);

    vi.advanceTimersByTime(101);

    const timeoutEvent = events.find((e) => e.type === "timeout");
    expect(timeoutEvent).toBeDefined();
    shortQueue.dispose();
  });

  it("uses default fallback 'deny' when not configured", () => {
    const defaultQueue = new ApprovalQueue();
    const events: ApprovalEvent[] = [];
    defaultQueue.on((e) => events.push(e));

    const request = makeRequest();
    const decision = makeDecision({ escalation: undefined });
    const approval = defaultQueue.enqueue(request, decision);

    expect(approval.fallbackAction).toBe("deny");
    defaultQueue.dispose();
  });

  // ── Dispose ──

  it("dispose clears all pending requests and timers", () => {
    const r1 = makeRequest("01905f7c-0001-7000-8000-000000000001");
    const r2 = makeRequest("01905f7c-0002-7000-8000-000000000002");
    queue.enqueue(r1, makeDecision({ requestId: r1.requestId }));
    queue.enqueue(r2, makeDecision({ requestId: r2.requestId }));

    expect(queue.size).toBe(2);
    queue.dispose();
    expect(queue.size).toBe(0);

    // Timers should be cleared — no timeout events after advancing
    const events: ApprovalEvent[] = [];
    queue.on((e) => events.push(e));
    vi.advanceTimersByTime(60_000);
    expect(events).toHaveLength(0);
  });
});
