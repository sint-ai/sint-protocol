import { describe, it, expect, vi } from "vitest";
import { ParallelNode } from "../../src/bt/nodes/parallel.js";
import { Blackboard } from "../../src/bt/blackboard.js";
import type { TreeNode, NodeStatus } from "../../src/bt/types.js";

function mockNode(name: string, status: NodeStatus): TreeNode {
  return {
    name,
    tick: vi.fn().mockResolvedValue(status),
    reset: vi.fn(),
  };
}

describe("ParallelNode", () => {
  it("all succeed with threshold=all → success", async () => {
    const par = new ParallelNode("test", [
      mockNode("a", "success"),
      mockNode("b", "success"),
      mockNode("c", "success"),
    ], 3);
    const result = await par.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("threshold=1 and one succeeds → success", async () => {
    const par = new ParallelNode("test", [
      mockNode("a", "failure"),
      mockNode("b", "success"),
      mockNode("c", "failure"),
    ], 1);
    const result = await par.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("too many fail → failure", async () => {
    const par = new ParallelNode("test", [
      mockNode("a", "failure"),
      mockNode("b", "failure"),
      mockNode("c", "success"),
    ], 2);
    const result = await par.tick(new Blackboard());
    expect(result).toBe("failure");
  });

  it("mixed results → running", async () => {
    const par = new ParallelNode("test", [
      mockNode("a", "success"),
      mockNode("b", "running"),
      mockNode("c", "running"),
    ], 2);
    const result = await par.tick(new Blackboard());
    expect(result).toBe("running");
  });

  it("empty children → success", async () => {
    const par = new ParallelNode("test", [], 0);
    const result = await par.tick(new Blackboard());
    expect(result).toBe("success");
  });
});
