import { describe, expect, it } from "vitest";
import {
  canonicalJSONStringify,
  computeSigningPayload,
  generateKeypair,
  issueCapabilityToken,
} from "../src/index.js";
import type { SintCapabilityTokenRequest } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("canonicalJSONStringify", () => {
  it("sorts nested object keys recursively while preserving array order", () => {
    const value = {
      z: 1,
      nested: {
        b: 2,
        a: 1,
      },
      arr: [{ y: 2, x: 1 }, "keep-order"],
    };

    expect(canonicalJSONStringify(value)).toBe(
      '{"arr":[{"x":1,"y":2},"keep-order"],"nested":{"a":1,"b":2},"z":1}',
    );
  });

  it("omits undefined object properties", () => {
    expect(
      canonicalJSONStringify({
        keep: true,
        drop: undefined,
        nested: { alsoDrop: undefined, keep: "x" },
      }),
    ).toBe('{"keep":true,"nested":{"keep":"x"}}');
  });
});

describe("computeSigningPayload", () => {
  it("is stable across nested key reordering and ignores signature field", () => {
    const issuer = generateKeypair();
    const subject = generateKeypair();

    const request: SintCapabilityTokenRequest = {
      issuer: issuer.publicKey,
      subject: subject.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        geofence: {
          coordinates: [
            [-122.4, 37.7],
            [-122.4, 37.8],
            [-122.3, 37.8],
            [-122.3, 37.7],
          ],
        },
        maxVelocityMps: 0.5,
        maxForceNewtons: 50,
      },
      behavioralConstraints: {
        allowedPatterns: ["^publishVelocity$"],
        maxCallsPerMinute: 30,
      },
      cryptoProfile: "classic-ed25519",
      passportId: "aps:passport:robot-7",
      delegationDepth: 2,
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      revocationEndpoint: "https://example.com/revoke",
    };

    const result = issueCapabilityToken(request, issuer.privateKey);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const token = result.value;
    const reordered = {
      ...token,
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
      behavioralConstraints: {
        maxCallsPerMinute: 30,
        allowedPatterns: ["^publishVelocity$"],
      },
      cryptoProfile: "classic-ed25519",
      signature: "f".repeat(128),
    };

    expect(computeSigningPayload(reordered)).toBe(computeSigningPayload(token));
  });
});
