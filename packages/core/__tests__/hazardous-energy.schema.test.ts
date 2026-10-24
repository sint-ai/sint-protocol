import { describe, expect, it } from "vitest";
import {
  hazardousEnergyEnvelopeSchema,
  perceptionEvidenceSchema,
} from "../src/schemas/hazardous-energy.schema.js";

const hash = "a".repeat(64);
const signature = "b".repeat(128);

describe("hazardous energy schemas", () => {
  it("accepts a tightly bounded laser envelope", () => {
    const result = hazardousEnergyEnvelopeSchema.safeParse({
      domain: "laser",
      actuatorIds: ["module-04/laser-left"],
      maxPowerWatts: 240,
      maxDwellMs: 35,
      maxFiringsPerMinute: 1_000,
      allowedTargetClasses: ["weed_meristem"],
      protectedTargetClasses: ["crop", "human", "animal", "unknown"],
      minTargetConfidence: 0.995,
      maxObservationAgeMs: 50,
      maxSpatialUncertaintyMm: 0.5,
      minProtectedObjectClearanceMm: 3,
      requiredInterlocks: ["shield", "beam-enable"],
      requireHealthyCooling: true,
      requireHardwarePermit: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a class that is simultaneously allowed and protected", () => {
    const result = hazardousEnergyEnvelopeSchema.safeParse({
      domain: "laser",
      actuatorIds: ["laser-1"],
      allowedTargetClasses: ["unknown"],
      protectedTargetClasses: ["unknown"],
      minTargetConfidence: 0.99,
      maxObservationAgeMs: 50,
      maxSpatialUncertaintyMm: 1,
      minProtectedObjectClearanceMm: 1,
      requireHardwarePermit: true,
    });

    expect(result.success).toBe(false);
  });

  it("accepts digest-only signed perception evidence", () => {
    const result = perceptionEvidenceSchema.safeParse({
      evidenceId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f000",
      observedAt: "2026-10-02T12:00:00.000000Z",
      validUntil: "2026-10-02T12:00:00.050000Z",
      sensorId: "module-04/camera-1",
      frameDigest: hash,
      modelId: "large-plant-model-v2",
      checkpointDigest: hash,
      calibrationDigest: hash,
      target: {
        classId: "weed_meristem",
        confidence: 0.999,
        centroid: { x: 123.4, y: 567.8 },
        spatialUncertaintyMm: 0.2,
      },
      nearbyProtectedObjects: [],
      verifierRef: "sint://verifier/perception-1",
      signerPublicKey: hash,
      signature,
    });

    expect(result.success).toBe(true);
  });

  it("rejects evidence whose validity ends before observation", () => {
    const result = perceptionEvidenceSchema.safeParse({
      evidenceId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f000",
      observedAt: "2026-10-02T12:00:01.000000Z",
      validUntil: "2026-10-02T12:00:00.000000Z",
      sensorId: "camera-1",
      frameDigest: hash,
      modelId: "model-1",
      checkpointDigest: hash,
      calibrationDigest: hash,
      target: {
        classId: "weed",
        confidence: 1,
        centroid: { x: 0, y: 0 },
        spatialUncertaintyMm: 0,
      },
      nearbyProtectedObjects: [],
      verifierRef: "verifier-1",
      signerPublicKey: hash,
      signature,
    });

    expect(result.success).toBe(false);
  });
});
