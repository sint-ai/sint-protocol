import { describe, it, expect, vi } from "vitest";
import { SequenceNode } from "../../src/bt/nodes/sequence.js";
import { Blackboard } from "../../src/bt/blackboard.js";
import type { TreeNode, NodeStatus } from "../../src/bt/types.js";

function mockNode(name: string, status: NodeStatus): TreeNode {
  return {
    name,
    tick: vi.fn().mockResolvedValue(status),
    reset: vi.fn(),
  };
}

describe("SequenceNode", () => {
  it("all succeed → success", async () => {
    const seq = new SequenceNode("test", [
      mockNode("a", "success"),
      mockNode("b", "success"),
      mockNode("c", "success"),
    ]);
    const result = await seq.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("first fails → failure (short-circuit)", async () => {
    const b = mockNode("b", "success");
    const seq = new SequenceNode("test", [
      mockNode("a", "failure"),
      b,
    ]);
    const result = await seq.tick(new Blackboard());
    expect(result).toBe("failure");
    expect(b.tick).not.toHaveBeenCalled();
  });

  it("middle child running → running", async () => {
    const c = mockNode("c", "success");
    const seq = new SequenceNode("test", [
      mockNode("a", "success"),
      mockNode("b", "running"),
      c,
    ]);
    const result = await seq.tick(new Blackboard());
    expect(result).toBe("running");
    expect(c.tick).not.toHaveBeenCalled();
  });

  it("empty children → success", async () => {
    const seq = new SequenceNode("test", []);
    const result = await seq.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("resets all children on reset()", () => {
    const a = mockNode("a", "success");
    const b = mockNode("b", "success");
    const seq = new SequenceNode("test", [a, b]);
    seq.reset();
    expect(a.reset).toHaveBeenCalled();
    expect(b.reset).toHaveBeenCalled();
  });
});
