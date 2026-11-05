/**
 * ROS 2 control-tick shield.
 *
 * A device tick does not consult a simulator. A commanded speed above the
 * token velocity bound must not reach the publisher.
 */

import { describe, expect, it } from "vitest";
import { publishRos2CmdVelTick } from "../src/runtime-shield.js";

describe("ROS 2 runtime shield", () => {
  it("does not publish a cmd_vel tick faster than the token velocity bound", () => {
    const published: number[] = [];
    const result = publishRos2CmdVelTick(
      { linearXMps: 1.2, maxVelocityMps: 0.5 },
      { publish: (linearXMps) => published.push(linearXMps) },
    );

    expect(published).toEqual([]);
    expect(result.published).toBe(false);
  });

  it("does not publish a reverse cmd_vel tick faster than the token velocity bound", () => {
    const published: number[] = [];
    const result = publishRos2CmdVelTick(
      { linearXMps: -1.2, maxVelocityMps: 0.5 },
      { publish: (linearXMps) => published.push(linearXMps) },
    );

    expect(published).toEqual([]);
    expect(result.published).toBe(false);
  });

  it("publishes a cmd_vel tick at the token velocity bound", () => {
    const published: number[] = [];
    const result = publishRos2CmdVelTick(
      { linearXMps: 0.5, maxVelocityMps: 0.5 },
      { publish: (linearXMps: number) => published.push(linearXMps) },
    );

    expect(published).toEqual([0.5]);
    expect(result.published).toBe(true);
  });

  it("does not publish a cmd_vel tick whose yaw rate exceeds the token angular bound", () => {
    const published: number[] = [];
    const result = publishRos2CmdVelTick(
      {
        linearXMps: 0.2,
        maxVelocityMps: 0.5,
        angularZRps: 1.2,
        maxAngularVelocityRps: 0.5,
      },
      { publish: (linearXMps) => published.push(linearXMps) },
    );

    expect(published).toEqual([]);
    expect(result.published).toBe(false);
  });

  it("does not publish a reverse cmd_vel tick whose yaw rate exceeds the token angular bound", () => {
    const published: number[] = [];
    const result = publishRos2CmdVelTick(
      {
        linearXMps: 0.2,
        maxVelocityMps: 0.5,
        angularZRps: -1.2,
        maxAngularVelocityRps: 0.5,
      },
      { publish: (linearXMps) => published.push(linearXMps) },
    );

    expect(published).toEqual([]);
    expect(result.published).toBe(false);
  });
});
