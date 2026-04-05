import { describe, expect, it } from "vitest";
import { ApprovalEventBus } from "../src/ws/ws-approval-stream.js";

describe("ApprovalEventBus", () => {
  it("assigns monotonic sequence numbers and replays by cursor", () => {
    const bus = new ApprovalEventBus(10);

    bus.emit({
      type: "DECISION",
      requestId: "r-1",
      agentId: "a",
      resource: "ros2:///cmd_vel",
      action: "publish",
      tier: "T2_ACT",
      decision: "escalate",
      timestamp: new Date("2026-04-01T10:00:00.000Z").toISOString(),
    });
    bus.emit({
      type: "APPROVAL_REQUIRED",
      requestId: "r-2",
      agentId: "a",
      resource: "ros2:///cmd_vel",
      action: "publish",
      tier: "T2_ACT",
      timestamp: new Date("2026-04-01T10:00:01.000Z").toISOString(),
    });

    const replay = bus.replayAfter(1, 10);
    expect(replay).toHaveLength(1);
    expect(replay[0]?.requestId).toBe("r-2");
    expect(replay[0]?.sequence).toBe(2);
  });

  it("replays by timestamp and respects bounded history", () => {
    const bus = new ApprovalEventBus(2);

    bus.emit({
      type: "DECISION",
      requestId: "old",
      agentId: "a",
      resource: "mcp://fs/read",
      action: "call",
      tier: "T2_ACT",
      decision: "allow",
      timestamp: new Date("2026-04-01T10:00:00.000Z").toISOString(),
    });
    bus.emit({
      type: "DECISION",
      requestId: "mid",
      agentId: "a",
      resource: "mcp://fs/write",
      action: "call",
      tier: "T2_ACT",
      decision: "escalate",
      timestamp: new Date("2026-04-01T10:00:01.000Z").toISOString(),
    });
    bus.emit({
      type: "DECISION",
      requestId: "new",
      agentId: "a",
      resource: "mcp://fs/delete",
      action: "call",
      tier: "T3_COMMIT",
      decision: "deny",
      timestamp: new Date("2026-04-01T10:00:02.000Z").toISOString(),
    });

    const replay = bus.replayAfterTimestamp("2026-04-01T10:00:00.500Z", 10);
    expect(replay.map((e) => e.requestId)).toEqual(["mid", "new"]);
  });
});
