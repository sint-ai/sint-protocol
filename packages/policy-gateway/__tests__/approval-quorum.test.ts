/**
 * SINT ApprovalQueue — M-of-N quorum approval tests.
 *
 * Verifies the multi-party approval flow: K approvals from N authorized
 * operators must be collected before a T3 request resolves.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApprovalQueue, type ApprovalQuorum } from "../src/approval-flow.js";
import type { PolicyDecision, SintRequest } from "@pshkv/core";
import { ApprovalTier, RiskTier } from "@pshkv/core";

function makeRequest(id = "req-001"): SintRequest {
  return {
    requestId: id as any,
    timestamp: new Date().toISOString(),
    agentId: "agent-pubkey-abc",
    tokenId: "token-id-001" as any,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
  };
}

function makeEscalation(requestId = "req-001"): PolicyDecision {
  return {
    requestId: requestId as any,
    timestamp: new Date().toISOString(),
    action: "escalate",
    assignedTier: ApprovalTier.T3_COMMIT,
    assignedRisk: RiskTier.T3_IRREVERSIBLE,
    escalation: {
      requiredTier: ApprovalTier.T3_COMMIT,
      reason: "Irreversible physical action",
      timeoutMs: 5_000,
      fallbackAction: "safe-stop",
    },
  };
}

describe("ApprovalQueue — M-of-N quorum", () => {
  let queue: ApprovalQueue;
  let events: any[];

  beforeEach(() => {
    queue = new ApprovalQueue({ defaultTimeoutMs: 5_000 });
    events = [];
    queue.on((e) => events.push(e));
  });

  it("resolves immediately with no quorum (single-approver default)", () => {
    const req = makeRequest();
    queue.enqueue(req, makeEscalation());
    const resolution = queue.resolve("req-001", { status: "approved", by: "op-alice" });
    expect(resolution?.status).toBe("approved");
    expect(queue.size).toBe(0);
  });

  it("2-of-3 quorum: pending after 1 approval", () => {
    const quorum: ApprovalQuorum = { required: 2, authorized: ["op-alice", "op-bob", "op-carol"] };
    queue.enqueue(makeRequest(), makeEscalation(), quorum);

    const res = queue.resolve("req-001", { status: "approved", by: "op-alice" });
    expect(res).toBeUndefined(); // still pending
    expect(queue.size).toBe(1);
    expect(queue.getApprovalCount("req-001")).toBe(1);
  });

  it("2-of-3 quorum: resolves after 2nd approval", () => {
    const quorum: ApprovalQuorum = { required: 2, authorized: ["op-alice", "op-bob", "op-carol"] };
    queue.enqueue(makeRequest(), makeEscalation(), quorum);

    queue.resolve("req-001", { status: "approved", by: "op-alice" });
    const res = queue.resolve("req-001", { status: "approved", by: "op-bob" });

    expect(res?.status).toBe("approved");
    expect((res as any).approvers).toEqual(["op-alice", "op-bob"]);
    expect(queue.size).toBe(0);
  });

  it("denial from any authorized operator immediately rejects", () => {
    const quorum: ApprovalQuorum = { required: 3, authorized: ["op-alice", "op-bob", "op-carol"] };
    queue.enqueue(makeRequest(), makeEscalation(), quorum);

    // One approval first
    queue.resolve("req-001", { status: "approved", by: "op-alice" });
    expect(queue.size).toBe(1);

    // Bob denies — immediate rejection
    const res = queue.resolve("req-001", { status: "denied", by: "op-bob", reason: "Safety concern" });
    expect(res?.status).toBe("denied");
    expect((res as any).by).toBe("op-bob");
    expect(queue.size).toBe(0);
  });

  it("unauthorized voter is ignored (returns undefined, queue unchanged)", () => {
    const quorum: ApprovalQuorum = { required: 1, authorized: ["op-alice"] };
    queue.enqueue(makeRequest(), makeEscalation(), quorum);

    const res = queue.resolve("req-001", { status: "approved", by: "op-mallory" });
    expect(res).toBeUndefined();
    expect(queue.size).toBe(1);
  });

  it("duplicate votes from same operator are counted once", () => {
    const quorum: ApprovalQuorum = { required: 2, authorized: ["op-alice", "op-bob"] };
    queue.enqueue(makeRequest(), makeEscalation(), quorum);

    queue.resolve("req-001", { status: "approved", by: "op-alice" });
    queue.resolve("req-001", { status: "approved", by: "op-alice" }); // duplicate
    expect(queue.getApprovalCount("req-001")).toBe(1); // counted once
    expect(queue.size).toBe(1); // still pending
  });

  it("1-of-1 quorum resolves with first approval", () => {
    const quorum: ApprovalQuorum = { required: 1, authorized: ["op-alice"] };
    queue.enqueue(makeRequest(), makeEscalation(), quorum);

    const res = queue.resolve("req-001", { status: "approved", by: "op-alice" });
    expect(res?.status).toBe("approved");
  });

  it("resolved event is emitted only once quorum is reached", () => {
    const quorum: ApprovalQuorum = { required: 2, authorized: ["op-alice", "op-bob"] };
    queue.enqueue(makeRequest(), makeEscalation(), quorum);

    queue.resolve("req-001", { status: "approved", by: "op-alice" });
    const resolvedEvents = events.filter((e) => e.type === "resolved");
    expect(resolvedEvents.length).toBe(0); // not yet

    queue.resolve("req-001", { status: "approved", by: "op-bob" });
    expect(events.filter((e) => e.type === "resolved").length).toBe(1);
  });

  it("timeout fires with safe-stop fallback and quorum not reached", async () => {
    vi.useFakeTimers();
    const quorum: ApprovalQuorum = { required: 2, authorized: ["op-alice", "op-bob"] };
    const decision = { ...makeEscalation(), escalation: { ...makeEscalation().escalation!, timeoutMs: 100 } };
    queue.enqueue(makeRequest(), decision, quorum);

    // Only one approval — not enough
    queue.resolve("req-001", { status: "approved", by: "op-alice" });

    vi.advanceTimersByTime(200);

    const timeoutEvent = events.find((e) => e.type === "timeout");
    expect(timeoutEvent).toBeDefined();
    expect(timeoutEvent.fallbackAction).toBe("safe-stop");
    expect(queue.size).toBe(0);

    vi.useRealTimers();
  });

  it("multiple independent quorum requests do not interfere", () => {
    const q2: ApprovalQuorum = { required: 2, authorized: ["op-alice", "op-bob"] };

    queue.enqueue(makeRequest("req-A"), makeEscalation("req-A"), q2);
    queue.enqueue(makeRequest("req-B"), makeEscalation("req-B"), q2);

    // Resolve req-A
    queue.resolve("req-A", { status: "approved", by: "op-alice" });
    queue.resolve("req-A", { status: "approved", by: "op-bob" });
    expect(queue.size).toBe(1); // req-B still pending

    // Deny req-B
    queue.resolve("req-B", { status: "denied", by: "op-alice", reason: "No" });
    expect(queue.size).toBe(0);
  });

  it("getApprovalCount returns 0 for unknown request", () => {
    expect(queue.getApprovalCount("nonexistent")).toBe(0);
  });
});
