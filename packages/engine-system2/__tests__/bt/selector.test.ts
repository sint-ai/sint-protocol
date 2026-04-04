import { describe, it, expect, vi } from "vitest";
import { SelectorNode } from "../../src/bt/nodes/selector.js";
import { Blackboard } from "../../src/bt/blackboard.js";
import type { TreeNode, NodeStatus } from "../../src/bt/types.js";

function mockNode(name: string, status: NodeStatus): TreeNode {
  return {
    name,
    tick: vi.fn().mockResolvedValue(status),
    reset: vi.fn(),
  };
}

describe("SelectorNode", () => {
  it("first succeeds → success (short-circuit)", async () => {
    const b = mockNode("b", "failure");
    const sel = new SelectorNode("test", [
      mockNode("a", "success"),
      b,
    ]);
    const result = await sel.tick(new Blackboard());
    expect(result).toBe("success");
    expect(b.tick).not.toHaveBeenCalled();
  });

  it("all fail → failure", async () => {
    const sel = new SelectorNode("test", [
      mockNode("a", "failure"),
      mockNode("b", "failure"),
      mockNode("c", "failure"),
    ]);
    const result = await sel.tick(new Blackboard());
    expect(result).toBe("failure");
  });

  it("child running → running", async () => {
    const c = mockNode("c", "success");
    const sel = new SelectorNode("test", [
      mockNode("a", "failure"),
      mockNode("b", "running"),
      c,
    ]);
    const result = await sel.tick(new Blackboard());
    expect(result).toBe("running");
    expect(c.tick).not.toHaveBeenCalled();
  });

  it("second succeeds after first fails → success", async () => {
    const sel = new SelectorNode("test", [
      mockNode("a", "failure"),
      mockNode("b", "success"),
    ]);
    const result = await sel.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("empty children → failure", async () => {
    const sel = new SelectorNode("test", []);
    const result = await sel.tick(new Blackboard());
    expect(result).toBe("failure");
  });
});
