/**
 * SINT Protocol — StaticSpatialCorridorVerifier tests.
 */

import { describe, expect, it } from "vitest";
import type { SintCapabilityToken, SintRequest } from "@pshkv/core";
import { StaticSpatialCorridorVerifier } from "../src/spatial-corridor.js";

const token = {
  executionEnvelope: {
    corridorId: "aisle-7",
  },
} as SintCapabilityToken;

function requestAt(
  x: number,
  y: number,
  headingDeg?: number,
): SintRequest {
  return {
    physicalContext: {
      currentPosition: { x, y, z: 0 },
      ...(headingDeg !== undefined ? { currentHeadingDeg: headingDeg } : {}),
    },
    executionContext: {
      preapprovedCorridor: {
        corridorId: "aisle-7",
        expiresAt: "2026-06-04T12:00:00.000000Z",
      },
    },
  } as SintRequest;
}

describe("StaticSpatialCorridorVerifier", () => {
  const verifier = new StaticSpatialCorridorVerifier({
    "aisle-7": {
      polygon: {
        coordinates: [
          [0, -1],
          [10, -1],
          [10, 1],
          [0, 1],
          [0, -1],
        ],
      },
      centerline: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      nominalHeadingDeg: 90,
      verifierRef: "static-test-map",
    },
  });

  it("verifies a pose inside the corridor and measures lateral/heading deviation", async () => {
    const result = await verifier.verifyCorridor(requestAt(4, 0.25, 100), token);

    expect(result.verified).toBe(true);
    expect(result.insideCorridor).toBe(true);
    expect(result.lateralDeviationMeters).toBeCloseTo(0.25);
    expect(result.headingDeviationDeg).toBe(10);
    expect(result.verifierRef).toBe("static-test-map");
  });

  it("reports outside-corridor poses", async () => {
    const result = await verifier.verifyCorridor(requestAt(4, 2, 90), token);

    expect(result.verified).toBe(true);
    expect(result.insideCorridor).toBe(false);
    expect(result.reason).toBe("position outside corridor polygon");
  });

  it("handles heading wraparound with the shortest angular difference", async () => {
    const result = await verifier.verifyCorridor(requestAt(4, 0, -260), token);

    expect(result.headingDeviationDeg).toBe(10);
  });

  it("fails verification for unknown corridor IDs", async () => {
    const result = await verifier.verifyCorridor(
      requestAt(4, 0, 90),
      { executionEnvelope: { corridorId: "missing" } } as SintCapabilityToken,
    );

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("unknown corridor missing");
  });
});
