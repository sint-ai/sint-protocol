import { describe, it, expect, vi } from "vitest";
import { InverterNode, RepeatNode, RetryNode } from "../../src/bt/nodes/decorator.js";
import { Blackboard } from "../../src/bt/blackboard.js";
import type { TreeNode, NodeStatus } from "../../src/bt/types.js";

function mockNode(name: string, status: NodeStatus): TreeNode {
  return {
    name,
    tick: vi.fn().mockResolvedValue(status),
    reset: vi.fn(),
  };
}

describe("Decorator Nodes", () => {
  it("InverterNode inverts success → failure", async () => {
    const inv = new InverterNode("inv", mockNode("child", "success"));
    const result = await inv.tick(new Blackboard());
    expect(result).toBe("failure");
  });

  it("InverterNode inverts failure → success", async () => {
    const inv = new InverterNode("inv", mockNode("child", "failure"));
    const result = await inv.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("InverterNode preserves running → running", async () => {
    const inv = new InverterNode("inv", mockNode("child", "running"));
    const result = await inv.tick(new Blackboard());
    expect(result).toBe("running");
  });

  it("RepeatNode repeats N times", async () => {
    const child = mockNode("child", "success");
    const rep = new RepeatNode("rep", child, 3);
    const bb = new Blackboard();

    // First two ticks should return "running" (1/3 and 2/3 complete)
    expect(await rep.tick(bb)).toBe("running");
    expect(await rep.tick(bb)).toBe("running");
    // Third tick completes all repetitions
    expect(await rep.tick(bb)).toBe("success");
    expect(child.tick).toHaveBeenCalledTimes(3);
  });

  it("RetryNode retries on failure", async () => {
    let callCount = 0;
    const child: TreeNode = {
      name: "flaky",
      tick: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount >= 3 ? "success" : "failure";
      }),
      reset: vi.fn(),
    };

    const retry = new RetryNode("retry", child, 5);
    const bb = new Blackboard();

    // First attempt fails, returns running (retry available)
    expect(await retry.tick(bb)).toBe("running");
    // Second attempt fails, returns running (retry available)
    expect(await retry.tick(bb)).toBe("running");
    // Third attempt succeeds
    expect(await retry.tick(bb)).toBe("success");
  });
});
