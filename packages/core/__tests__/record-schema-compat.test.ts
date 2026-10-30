import { describe, expect, it } from "vitest";
import { planStepSchema } from "../src/schemas/engine.schema.js";
import { effectPlanSchema } from "../src/schemas/simulation-evidence.schema.js";

describe("record schema compatibility", () => {
  it("keeps nested action parameters in a plan step", () => {
    const parsed = planStepSchema.parse({
      action: "publish",
      resource: "ros2:///cmd_vel",
      params: { linear: { x: 0.25, y: 0, z: 0 }, enabled: true },
      requiredTier: "T2_act",
      preconditions: [],
    });
    expect(parsed.params).toEqual({ linear: { x: 0.25, y: 0, z: 0 }, enabled: true });
  });

  it("rejects an array in place of effect-plan parameters", () => {
    const parsed = effectPlanSchema.safeParse({
      requestDigest: "a".repeat(64),
      effectPlanDigest: "b".repeat(64),
      tokenDigest: "c".repeat(64),
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: [0.25],
    });
    expect(parsed.success).toBe(false);
  });
});
