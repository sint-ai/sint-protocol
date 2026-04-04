/**
 * Geofence templates and physics constraints schema — unit tests.
 */

import { describe, it, expect } from "vitest";
import {
  GEOFENCE_TEMPLATES,
} from "../src/constants/geofence-templates.js";
import { physicalConstraintsSchema } from "../src/schemas/capability-token.schema.js";

describe("GEOFENCE_TEMPLATES", () => {
  it("WAREHOUSE_BAY_10M has correct coordinate count (5 pairs, closed ring)", () => {
    const { coordinates } = GEOFENCE_TEMPLATES.WAREHOUSE_BAY_10M;
    // Closed ring: 4 corners + 1 closing point = 5
    expect(coordinates).toHaveLength(5);
    // First and last should be identical (closed polygon)
    expect(coordinates[0]).toEqual(coordinates[coordinates.length - 1]);
  });

  it("ROBOT_ARM_1_5M coordinates are close to 1.5 m radius", () => {
    const { coordinates } = GEOFENCE_TEMPLATES.ROBOT_ARM_1_5M;
    // Every point except the closing one should be ~1.5 m from origin
    for (const [x, y] of coordinates.slice(0, -1)) {
      const dist = Math.sqrt(x * x + y * y);
      expect(dist).toBeCloseTo(1.5, 1);
    }
  });

  it("all templates have at least 4 coordinate pairs", () => {
    for (const [name, template] of Object.entries(GEOFENCE_TEMPLATES)) {
      expect(
        template.coordinates.length,
        `${name} should have at least 4 coordinate pairs`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("HOSPITAL_CORRIDOR has correct dimensions (20 m × 3 m)", () => {
    const { coordinates } = GEOFENCE_TEMPLATES.HOSPITAL_CORRIDOR;
    const xs = coordinates.map(([x]) => x);
    const ys = coordinates.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3, 5);
  });

  it("OUTDOOR_AMR_100M spans 100 m on each axis", () => {
    const { coordinates } = GEOFENCE_TEMPLATES.OUTDOOR_AMR_100M;
    const xs = coordinates.map(([x]) => x);
    const ys = coordinates.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100, 5);
  });
});

describe("physicalConstraintsSchema — new physics fields", () => {
  it("accepts maxTorqueNm as a positive number", () => {
    const result = physicalConstraintsSchema.safeParse({ maxTorqueNm: 10.5 });
    expect(result.success).toBe(true);
  });

  it("accepts maxJerkMps3 as a positive number", () => {
    const result = physicalConstraintsSchema.safeParse({ maxJerkMps3: 2.0 });
    expect(result.success).toBe(true);
  });

  it("rejects negative maxAngularVelocityRps", () => {
    const result = physicalConstraintsSchema.safeParse({
      maxAngularVelocityRps: -1.0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts contactForceThresholdN as a positive number", () => {
    const result = physicalConstraintsSchema.safeParse({
      contactForceThresholdN: 5.0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all new physics fields together", () => {
    const result = physicalConstraintsSchema.safeParse({
      maxTorqueNm: 20,
      maxJerkMps3: 3,
      maxAngularVelocityRps: 1.57,
      contactForceThresholdN: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative maxTorqueNm", () => {
    const result = physicalConstraintsSchema.safeParse({ maxTorqueNm: -5 });
    expect(result.success).toBe(false);
  });
});
