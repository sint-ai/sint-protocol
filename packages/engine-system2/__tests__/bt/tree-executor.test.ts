import { describe, it, expect, vi, afterEach } from "vitest";
import { TreeExecutor } from "../../src/bt/tree-executor.js";
import { Blackboard } from "../../src/bt/blackboard.js";
import type { TreeNode, NodeStatus } from "../../src/bt/types.js";

function mockNode(name: string, status: NodeStatus): TreeNode {
  return {
    name,
    tick: vi.fn().mockResolvedValue(status),
    reset: vi.fn(),
  };
}

describe("TreeExecutor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start/stop lifecycle", async () => {
    const root = mockNode("root", "success");
    const executor = new TreeExecutor(root, new Blackboard(), { tickRateMs: 10 });

    executor.start();
    expect(executor.isRunning()).toBe(true);

    // Wait a bit for at least one tick
    await new Promise((resolve) => setTimeout(resolve, 50));

    executor.stop();
    expect(executor.isRunning()).toBe(false);
  });

  it("tickOnce ticks root node", async () => {
    const root = mockNode("root", "success");
    const executor = new TreeExecutor(root, new Blackboard());
    executor.start();

    const status = await executor.tickOnce();
    expect(status).toBe("success");
    expect(root.tick).toHaveBeenCalled();

    executor.stop();
  });

  it("isRunning reflects state", () => {
    const root = mockNode("root", "success");
    const executor = new TreeExecutor(root, new Blackboard());

    expect(executor.isRunning()).toBe(false);
    executor.start();
    expect(executor.isRunning()).toBe(true);
    executor.stop();
    expect(executor.isRunning()).toBe(false);
  });

  it("tick emits engine.system2.tick event", async () => {
    const root = mockNode("root", "success");
    const onEvent = vi.fn();
    const executor = new TreeExecutor(root, new Blackboard(), {}, onEvent);
    executor.start();

    await executor.tickOnce();

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "engine.system2.tick",
        payload: expect.objectContaining({
          tickNumber: 1,
          rootNode: "root",
          status: "success",
        }),
      }),
    );

    executor.stop();
  });

  it("handles root returning failure", async () => {
    const root = mockNode("root", "failure");
    const executor = new TreeExecutor(root, new Blackboard());
    executor.start();

    const status = await executor.tickOnce();
    expect(status).toBe("failure");

    executor.stop();
  });

  it("handles root returning running", async () => {
    const root = mockNode("root", "running");
    const executor = new TreeExecutor(root, new Blackboard());
    executor.start();

    const status = await executor.tickOnce();
    expect(status).toBe("running");

    executor.stop();
  });

  it("stop prevents further ticks", async () => {
    const root = mockNode("root", "success");
    const executor = new TreeExecutor(root, new Blackboard());

    // tickOnce without start should return failure (not running)
    const status = await executor.tickOnce();
    expect(status).toBe("failure");
    expect(root.tick).not.toHaveBeenCalled();
  });
});
