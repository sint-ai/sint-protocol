import { describe, expect, it } from "vitest";
import type { SintRequest } from "@pshkv/core";
import { ObstacleAwareEnvelope } from "../src/obstacle-envelope.js";

const request = {} as SintRequest;

describe("ObstacleAwareEnvelope", () => {
  it("does not tighten limits for an explicit no-obstacle reading", async () => {
    const envelope = new ObstacleAwareEnvelope({
      getNearestObstacleM: () => Infinity,
    });

    await expect(envelope.computeEnvelope(request)).resolves.toEqual({});
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, -0.01])(
    "fails safe for invalid obstacle measurement %s",
    async (measurement) => {
      const envelope = new ObstacleAwareEnvelope({
        getNearestObstacleM: () => measurement,
      });

      await expect(envelope.computeEnvelope(request)).resolves.toEqual({
        maxVelocityMps: 0,
        maxForceNewtons: 0,
        reason: "invalid obstacle measurement — stop",
      });
    },
  );

  it("treats a zero-distance reading as contact and stops", async () => {
    const envelope = new ObstacleAwareEnvelope({
      getNearestObstacleM: () => 0,
    });

    const result = await envelope.computeEnvelope(request);
    expect(result.maxVelocityMps).toBe(0);
    expect(result.maxForceNewtons).toBe(0);
    expect(result.reason).toContain("stop");
  });
});
