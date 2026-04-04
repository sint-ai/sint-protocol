import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  issueCapabilityToken,
  validateCapabilityToken,
  validatePhysicalConstraints,
  validateDelegationDepth,
  isPointInPolygon,
} from "../src/index.js";
import type { SintCapabilityTokenRequest, SintCapabilityToken } from "@sint/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function createValidToken(
  overrides?: Partial<SintCapabilityTokenRequest>,
): SintCapabilityToken {
  const issuer = generateKeypair();
  const subject = generateKeypair();
  const request: SintCapabilityTokenRequest = {
    issuer: issuer.publicKey,
    subject: subject.publicKey,
    resource: "ros2:///cmd_vel",
    actions: ["publish", "subscribe"],
    constraints: {
      maxForceNewtons: 50,
      maxVelocityMps: 0.5,
      geofence: {
        coordinates: [
          [-122.4, 37.7],
          [-122.4, 37.8],
          [-122.3, 37.8],
          [-122.3, 37.7],
        ],
      },
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(12),
    revocable: true,
    ...overrides,
  };
  const result = issueCapabilityToken(request, issuer.privateKey);
  if (!result.ok) throw new Error("Failed to create test token");
  return result.value;
}

describe("Capability Token Validator", () => {
  it("should validate a correctly issued token", () => {
    const token = createValidToken();
    const result = validateCapabilityToken(token, {
      resource: "ros2:///cmd_vel",
      action: "publish",
    });
    expect(result.ok).toBe(true);
  });

  it("should reject a token with tampered signature", () => {
    const token = createValidToken();
    const tampered = { ...token, signature: "a".repeat(128) };
    const result = validateCapabilityToken(tampered, {
      resource: "ros2:///cmd_vel",
      action: "publish",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID_SIGNATURE");
  });

  it("should reject a token with tampered resource", () => {
    const token = createValidToken();
    const tampered = { ...token, resource: "ros2:///evil_topic" };
    const result = validateCapabilityToken(tampered, {
      resource: "ros2:///evil_topic",
      action: "publish",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID_SIGNATURE");
  });

  it("should reject an expired token (no grace period)", () => {
    const token = createValidToken();
    const futureDate = new Date(Date.now() + 24 * 3600_000);
    const result = validateCapabilityToken(token, {
      resource: "ros2:///cmd_vel",
      action: "publish",
      now: futureDate,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("TOKEN_EXPIRED");
  });

  it("should reject insufficient permissions (wrong action)", () => {
    const token = createValidToken();
    const result = validateCapabilityToken(token, {
      resource: "ros2:///cmd_vel",
      action: "delete", // Not in token's actions
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("should reject insufficient permissions (wrong resource)", () => {
    const token = createValidToken();
    const result = validateCapabilityToken(token, {
      resource: "ros2:///other_topic",
      action: "publish",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("should enforce model ID allowlist when configured", () => {
    const token = createValidToken({
      modelConstraints: { allowedModelIds: ["gpt-5.4"] },
    });
    const result = validateCapabilityToken(token, {
      resource: "ros2:///cmd_vel",
      action: "publish",
      modelContext: { modelId: "gpt-4.1" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("CONSTRAINT_VIOLATION");
  });

  it("should enforce attestation minimum grade when configured", () => {
    const token = createValidToken({
      attestationRequirements: { minAttestationGrade: 2 },
    });
    const result = validateCapabilityToken(token, {
      resource: "ros2:///cmd_vel",
      action: "publish",
      modelContext: { attestationGrade: 1 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("CONSTRAINT_VIOLATION");
  });
});

describe("Physical Constraint Validation", () => {
  it("should block force limit violations", () => {
    const result = validatePhysicalConstraints(
      { maxForceNewtons: 50 },
      { commandedForceNewtons: 75 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("CONSTRAINT_VIOLATION");
  });

  it("should allow force within limits", () => {
    const result = validatePhysicalConstraints(
      { maxForceNewtons: 50 },
      { commandedForceNewtons: 45 },
    );
    expect(result.ok).toBe(true);
  });

  it("should block velocity limit violations", () => {
    const result = validatePhysicalConstraints(
      { maxVelocityMps: 0.5 },
      { commandedVelocityMps: 1.2 },
    );
    expect(result.ok).toBe(false);
  });

  it("should block geofence violations", () => {
    const result = validatePhysicalConstraints(
      {
        geofence: {
          coordinates: [
            [-122.4, 37.7],
            [-122.4, 37.8],
            [-122.3, 37.8],
            [-122.3, 37.7],
          ],
        },
      },
      { position: { x: -100, y: 10 } }, // Way outside geofence
    );
    expect(result.ok).toBe(false);
  });

  it("should allow position inside geofence", () => {
    const result = validatePhysicalConstraints(
      {
        geofence: {
          coordinates: [
            [-122.4, 37.7],
            [-122.4, 37.8],
            [-122.3, 37.8],
            [-122.3, 37.7],
          ],
        },
      },
      { position: { x: -122.35, y: 37.75 } }, // Inside geofence
    );
    expect(result.ok).toBe(true);
  });

  it("should block when human presence required but not detected", () => {
    const result = validatePhysicalConstraints(
      { requiresHumanPresence: true },
      { humanPresenceDetected: false },
    );
    expect(result.ok).toBe(false);
  });
});

describe("Delegation Depth Validation", () => {
  it("should allow depth within limits", () => {
    const token = createValidToken();
    const result = validateDelegationDepth(token, 3);
    expect(result.ok).toBe(true);
  });

  it("should reject depth exceeding max (4+ hops)", () => {
    const token = createValidToken();
    const deepToken = {
      ...token,
      delegationChain: { parentTokenId: "some-id" as any, depth: 4, attenuated: true },
    };
    const result = validateDelegationDepth(deepToken, 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("DELEGATION_DEPTH_EXCEEDED");
  });
});

describe("Point in Polygon (Geofencing)", () => {
  const square = {
    coordinates: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as [number, number][],
  };

  it("should detect point inside polygon", () => {
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
  });

  it("should detect point outside polygon", () => {
    expect(isPointInPolygon({ x: 15, y: 15 }, square)).toBe(false);
  });

  it("should detect point outside (negative coords)", () => {
    expect(isPointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });
});
