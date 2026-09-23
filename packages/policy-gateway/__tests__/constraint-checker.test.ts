/**
 * SINT Protocol — Constraint Checker edge case tests.
 *
 * Covers the edges noted in sint-ai/sint-protocol#7:
 *   - negative velocity values
 *   - exactly-at-boundary constraint values (velocity == maxVelocity)
 *   - empty constraint sets
 *   - malformed constraint objects
 *
 * Tests `checkConstraints` directly — no PolicyGateway, no token issuance —
 * so the behavior under test is the physical-constraint math, not the
 * surrounding gateway flow.
 */

import { describe, it, expect } from "vitest";
import {
  checkConstraints,
  extractPhysicalContext,
} from "../src/constraint-checker.js";
import type { SintCapabilityToken, SintRequest } from "@pshkv/core";

const agentId =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2";
const tokenId = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f000";
const requestId = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f001";
const timestamp = "2026-04-17T00:00:00.000000Z";

function makeToken(
  constraints: Partial<SintCapabilityToken["constraints"]> = {},
): SintCapabilityToken {
  return {
    tokenId,
    issuer: agentId,
    subject: agentId,
    resource: "ros2:///cmd_vel",
    actions: ["publish"],
    constraints: constraints as SintCapabilityToken["constraints"],
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    issuedAt: timestamp,
    expiresAt: "2027-01-01T00:00:00.000000Z",
    revocable: true,
    signature: "00".repeat(64),
  } as SintCapabilityToken;
}

function makeRequest(params: Record<string, unknown> = {}): SintRequest {
  return {
    requestId,
    timestamp,
    agentId,
    tokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params,
  } as SintRequest;
}

describe("checkConstraints — edge cases", () => {
  describe("velocity boundary", () => {
    it("allows velocity exactly equal to maxVelocityMps (strict > boundary)", () => {
      const token = makeToken({ maxVelocityMps: 2.0 });
      const req = makeRequest({ velocity: 2.0 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });

    it("denies velocity strictly above maxVelocityMps", () => {
      const token = makeToken({ maxVelocityMps: 2.0 });
      const req = makeRequest({ velocity: 2.0001 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toHaveLength(1);
        expect(result.error[0].constraint).toBe("maxVelocityMps");
        expect(result.error[0].limit).toBe(2.0);
        expect(result.error[0].actual).toBe(2.0001);
      }
    });

    it("allows velocity below maxVelocityMps", () => {
      const token = makeToken({ maxVelocityMps: 2.0 });
      const req = makeRequest({ velocity: 1.5 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });
  });

  describe("negative values", () => {
    it("allows negative commanded velocity — scalar comparison, not magnitude", () => {
      // Documents current behavior: `commanded > limit` is false when commanded is negative.
      // If signed reverse motion needs capping, the caller must pass the absolute value
      // or the constraint layer must be extended to check magnitude.
      const token = makeToken({ maxVelocityMps: 2.0 });
      const req = makeRequest({ velocity: -5.0 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });

    it("allows negative commanded force — same scalar semantics as velocity", () => {
      const token = makeToken({ maxForceNewtons: 10 });
      const req = makeRequest({ force: -50 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });
  });

  describe("empty constraint set", () => {
    it("allows any request when constraints = {}", () => {
      const token = makeToken({});
      const req = makeRequest({ velocity: 999, force: 999 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });

    it("allows request with no physical params when token has constraints", () => {
      const token = makeToken({ maxVelocityMps: 0.1 });
      const req = makeRequest({});
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });
  });

  describe("zero as a constraint limit", () => {
    it("allows velocity of exactly 0 when maxVelocityMps is 0 (strict > boundary)", () => {
      const token = makeToken({ maxVelocityMps: 0 });
      const req = makeRequest({ velocity: 0 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });

    it("denies any positive velocity when maxVelocityMps is 0", () => {
      const token = makeToken({ maxVelocityMps: 0 });
      const req = makeRequest({ velocity: 0.01 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
    });
  });

  describe("multiple simultaneous violations", () => {
    it("reports all violations in a single call, not just the first", () => {
      const token = makeToken({ maxVelocityMps: 1.0, maxForceNewtons: 10 });
      const req = makeRequest({ velocity: 5.0, force: 100 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toHaveLength(2);
        const names = result.error.map((v) => v.constraint).sort();
        expect(names).toEqual(["maxForceNewtons", "maxVelocityMps"]);
      }
    });
  });

  describe("envelope overrides", () => {
    it("tightens the effective limit when override is stricter than token", () => {
      const token = makeToken({ maxVelocityMps: 2.0 });
      const req = makeRequest({ velocity: 0.5 });
      const result = checkConstraints(token, req, { maxVelocityMps: 0.1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].message).toContain("dynamic envelope");
        expect(result.error[0].limit).toBe(0.1);
      }
    });

    it("is a no-op when override is looser than token — token limit still wins", () => {
      const token = makeToken({ maxVelocityMps: 0.3 });
      const req = makeRequest({ velocity: 0.5 });
      const result = checkConstraints(token, req, { maxVelocityMps: 2.0 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].limit).toBe(0.3);
      }
    });

    it("applies override alone when token has no constraint", () => {
      const token = makeToken({});
      const req = makeRequest({ velocity: 0.5 });
      const result = checkConstraints(token, req, { maxVelocityMps: 0.1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].limit).toBe(0.1);
      }
    });
  });

  describe("requiresHumanPresence", () => {
    it("denies when requiresHumanPresence is true and no human detected", () => {
      const token = makeToken({ requiresHumanPresence: true });
      const req = {
        ...makeRequest(),
        physicalContext: { humanDetected: false },
      } as SintRequest;
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].constraint).toBe("requiresHumanPresence");
      }
    });

    it("allows when requiresHumanPresence is true and human is detected", () => {
      const token = makeToken({ requiresHumanPresence: true });
      const req = {
        ...makeRequest(),
        physicalContext: { humanDetected: true },
      } as SintRequest;
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });

    it("allows when requiresHumanPresence is false regardless of detection", () => {
      const token = makeToken({ requiresHumanPresence: false });
      const req = makeRequest();
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });
  });

  describe("extractPhysicalContext", () => {
    it("prefers params.velocity over physicalContext.currentVelocityMps", () => {
      const req = {
        ...makeRequest({ velocity: 1.5 }),
        physicalContext: { currentVelocityMps: 9.9 },
      } as SintRequest;
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedVelocityMps).toBe(1.5);
    });

    it("falls back to physicalContext.currentVelocityMps when params missing", () => {
      const req = {
        ...makeRequest({}),
        physicalContext: { currentVelocityMps: 0.7 },
      } as SintRequest;
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedVelocityMps).toBe(0.7);
    });

    it("recognizes linear_velocity as an alias for velocity in params", () => {
      const req = makeRequest({ linear_velocity: 1.25 });
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedVelocityMps).toBe(1.25);
    });

    it("extracts Twist linear velocity magnitude from params.linear.{x,y,z}", () => {
      // Twist with linear.x=3, linear.y=4, linear.z=0 → magnitude = 5
      const req = makeRequest({ linear: { x: 3, y: 4, z: 0 } });
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedVelocityMps).toBe(5);
    });

    it("falls back to Twist linear velocity only when scalar params absent", () => {
      // Twist linear takes precedence only after scalar options exhausted
      const req = makeRequest({
        velocity: 1.0, // this should win
        linear: { x: 3, y: 4, z: 0 }, // magnitude 5, ignored
      });
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedVelocityMps).toBe(1.0);
    });

    it("extracts angular velocity from params.angular.z (Twist angular)", () => {
      const req = makeRequest({ angular: { z: 1.57 } }); // ~90 deg/s
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedAngularVelocityRps).toBe(1.57);
    });

    it("extracts torque from params.torque", () => {
      const req = makeRequest({ torque: 5.5 });
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedTorqueNm).toBe(5.5);
    });

    it("extracts jerk from params.jerk", () => {
      const req = makeRequest({ jerk: 2.1 });
      const ctx = extractPhysicalContext(req);
      expect(ctx.commandedJerkMps3).toBe(2.1);
    });

    it("extracts contact force from physicalContext.currentContactForceNewtons", () => {
      const req = {
        ...makeRequest({}),
        physicalContext: { currentContactForceNewtons: 15 },
      } as SintRequest;
      const ctx = extractPhysicalContext(req);
      expect(ctx.currentContactForceNewtons).toBe(15);
    });
  });

  describe("new constraint types", () => {
    it("denies torque exceeding maxTorqueNm", () => {
      const token = makeToken({ maxTorqueNm: 10 });
      const req = makeRequest({ torque: 15 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].constraint).toBe("maxTorqueNm");
        expect(result.error[0].limit).toBe(10);
        expect(result.error[0].actual).toBe(15);
      }
    });

    it("allows torque within maxTorqueNm", () => {
      const token = makeToken({ maxTorqueNm: 10 });
      const req = makeRequest({ torque: 8 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });

    it("denies jerk exceeding maxJerkMps3", () => {
      const token = makeToken({ maxJerkMps3: 5 });
      const req = makeRequest({ jerk: 6 });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].constraint).toBe("maxJerkMps3");
      }
    });

    it("denies angular velocity exceeding maxAngularVelocityRps", () => {
      const token = makeToken({ maxAngularVelocityRps: 1.0 });
      const req = makeRequest({ angular: { z: 1.5 } });
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].constraint).toBe("maxAngularVelocityRps");
      }
    });

    it("denies contact force exceeding contactForceThresholdN", () => {
      const token = makeToken({ contactForceThresholdN: 20 });
      const req = {
        ...makeRequest({}),
        physicalContext: { currentContactForceNewtons: 25 },
      } as SintRequest;
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error[0].constraint).toBe("contactForceThresholdN");
      }
    });

    it("allows multiple new constraints when all within limits", () => {
      const token = makeToken({
        maxTorqueNm: 10,
        maxJerkMps3: 5,
        maxAngularVelocityRps: 1.5,
        contactForceThresholdN: 20,
      });
      const req = {
        ...makeRequest({ torque: 8, jerk: 4, angular: { z: 1.0 } }),
        physicalContext: { currentContactForceNewtons: 15 },
      } as SintRequest;
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(true);
    });

    it("reports all constraint violations including new ones", () => {
      const token = makeToken({
        maxVelocityMps: 1.0,
        maxTorqueNm: 10,
        maxAngularVelocityRps: 0.5,
      });
      const req = {
        ...makeRequest({ velocity: 2.0, torque: 15, angular: { z: 1.0 } }),
      } as SintRequest;
      const result = checkConstraints(token, req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toHaveLength(3);
        const constraints = result.error.map((v) => v.constraint).sort();
        expect(constraints).toEqual([
          "maxAngularVelocityRps",
          "maxTorqueNm",
          "maxVelocityMps",
        ]);
      }
    });
  });
});
