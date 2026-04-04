import { describe, it, expect } from "vitest";
import { ConditionNode } from "../../src/bt/nodes/condition.js";
import { Blackboard } from "../../src/bt/blackboard.js";

describe("ConditionNode", () => {
  it("true predicate → success", async () => {
    const node = new ConditionNode("check", () => true);
    const result = await node.tick(new Blackboard());
    expect(result).toBe("success");
  });

  it("false predicate → failure", async () => {
    const node = new ConditionNode("check", () => false);
    const result = await node.tick(new Blackboard());
    expect(result).toBe("failure");
  });

  it("never returns running", async () => {
    const nodeTrue = new ConditionNode("check-true", () => true);
    const nodeFalse = new ConditionNode("check-false", () => false);
    const r1 = await nodeTrue.tick(new Blackboard());
    const r2 = await nodeFalse.tick(new Blackboard());
    expect(r1).not.toBe("running");
    expect(r2).not.toBe("running");
  });

  it("reads from blackboard", async () => {
    const node = new ConditionNode("has-target", (bb) => {
      return bb.get<number>("distance") !== undefined && bb.get<number>("distance")! < 5;
    });
    const bb = new Blackboard();
    bb.set("distance", 3);
    const result = await node.tick(bb);
    expect(result).toBe("success");
  });
});
