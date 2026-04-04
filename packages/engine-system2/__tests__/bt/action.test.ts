import { describe, it, expect, vi } from "vitest";
import { ActionNode } from "../../src/bt/nodes/action.js";
import { Blackboard } from "../../src/bt/blackboard.js";

describe("ActionNode", () => {
  it("action succeeds → success", async () => {
    const node = new ActionNode("act", async () => "success");
    const result = await node.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("action fails → failure", async () => {
    const node = new ActionNode("act", async () => "failure");
    const result = await node.tick(new Blackboard());
    expect(result).toBe("failure");
  });

  it("action returns running → running", async () => {
    const node = new ActionNode("act", async () => "running");
    const result = await node.tick(new Blackboard());
    expect(result).toBe("running");
  });

  it("action receives blackboard", async () => {
    const actionFn = vi.fn().mockResolvedValue("success");
    const node = new ActionNode("act", actionFn);
    const bb = new Blackboard();
    bb.set("key", "value");
    await node.tick(bb);
    expect(actionFn).toHaveBeenCalledWith(bb);
  });

  it("async action works correctly", async () => {
    const node = new ActionNode("act", async (bb) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      bb.set("done", true);
      return "success";
    });
    const bb = new Blackboard();
    const result = await node.tick(bb);
    expect(result).toBe("success");
    expect(bb.get<boolean>("done")).toBe(true);
  });

  it("action error propagates correctly", async () => {
    const node = new ActionNode("act", async () => {
      throw new Error("action failed");
    });
    await expect(node.tick(new Blackboard())).rejects.toThrow("action failed");
  });
});
