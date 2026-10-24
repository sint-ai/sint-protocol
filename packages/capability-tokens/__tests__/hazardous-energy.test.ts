import { describe, expect, it } from "vitest";
import type { SintCapabilityTokenRequest } from "@pshkv/core";
import {
  delegateCapabilityToken,
  generateKeypair,
  issueCapabilityToken,
  validateCapabilityToken,
} from "../src/index.js";

function futureISO(): string {
  return new Date(Date.now() + 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("hazardous-energy capability binding", () => {
  const issuer = generateKeypair();
  const subject = generateKeypair();
  const child = generateKeypair();

  const request: SintCapabilityTokenRequest = {
    issuer: issuer.publicKey,
    subject: subject.publicKey,
    resource: "laserweeder://farm-7/machine-2/module-04/laser-left",
    actions: ["pulse"],
    constraints: {},
    hazardousEnergyEnvelope: {
      domain: "laser",
      actuatorIds: ["module-04/laser-left"],
      maxPowerWatts: 240,
      maxDwellMs: 35,
      allowedTargetClasses: ["weed_meristem"],
      protectedTargetClasses: ["crop", "human", "animal", "unknown"],
      minTargetConfidence: 0.995,
      maxObservationAgeMs: 50,
      maxSpatialUncertaintyMm: 0.5,
      minProtectedObjectClearanceMm: 3,
      requireHardwarePermit: true,
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: true,
  };

  it("signs and validates the hazardous-energy envelope", () => {
    const issued = issueCapabilityToken(request, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    expect(issued.value.hazardousEnergyEnvelope).toEqual(request.hazardousEnergyEnvelope);
    expect(validateCapabilityToken(issued.value, {
      resource: request.resource,
      action: "pulse",
    }).ok).toBe(true);
  });

  it("carries the exact envelope through delegation without widening it", () => {
    const issued = issueCapabilityToken(request, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const delegated = delegateCapabilityToken(
      issued.value,
      { newSubject: child.publicKey },
      subject.privateKey,
    );
    expect(delegated.ok).toBe(true);
    if (!delegated.ok) return;

    expect(delegated.value.hazardousEnergyEnvelope).toEqual(issued.value.hazardousEnergyEnvelope);
  });
});
