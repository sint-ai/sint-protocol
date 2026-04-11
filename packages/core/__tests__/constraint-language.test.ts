import { describe, expect, it } from "vitest";
import {
  checkTightenOnlyViolations,
  mergeConstraintEnvelopes,
  resolveEffectiveConstraints,
  validateConstraintEnvelope,
} from "../src/constraint-language.js";
import type { ConstraintEnvelope } from "../src/types/protocol.js";

// ---------------------------------------------------------------------------
// validateConstraintEnvelope
// ---------------------------------------------------------------------------
describe("validateConstraintEnvelope", () => {
  it("valid CL-1.0 envelope returns valid:true, mode:static-token", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 0.5 },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("static-token");
    expect(result.errors).toHaveLength(0);
  });

  it("CL-1.0 with mode:dynamic-runtime and tightenOnly:true is valid", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      mode: "dynamic-runtime",
      dynamic: { tightenOnly: true },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("dynamic-runtime");
  });

  it("CL-1.0 with mode:dynamic-runtime missing tightenOnly produces error", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      mode: "dynamic-runtime",
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("dynamic.tightenOnly is required when mode is dynamic-runtime");
  });

  it("CL-1.0 with invalid mode produces error", () => {
    const envelope = {
      version: "cl-1.0",
      mode: "invalid-mode",
    } as unknown as ConstraintEnvelope;
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid mode");
  });

  it("CL-1.0 with negative maxVelocityMps produces error", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: -1 },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("physical.maxVelocityMps must be >= 0");
  });

  it("CL-1.0 with negative maxForceNewtons produces error", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxForceNewtons: -5 },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("physical.maxForceNewtons must be >= 0");
  });

  it("CL-1.0 with rateLimit maxCalls <= 0 produces error", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { rateLimit: { maxCalls: 0, windowMs: 60000 } },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("physical.rateLimit.maxCalls must be > 0");
  });

  it("CL-1.0 with rateLimit windowMs <= 0 produces error", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { rateLimit: { maxCalls: 10, windowMs: -1 } },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("physical.rateLimit.windowMs must be > 0");
  });

  it("legacy envelope (no version) returns mode:legacy, valid:true", () => {
    const envelope: ConstraintEnvelope = {
      corridorId: "corridor-1",
      maxDeviationMeters: 0.5,
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("legacy");
  });

  it("empty envelope is valid (all fields optional)", () => {
    const envelope: ConstraintEnvelope = {};
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("legacy");
  });

  it("CL-1.0 with mode:corridor-preapproved is valid", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      mode: "corridor-preapproved",
      execution: { corridorId: "aisle-7" },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("corridor-preapproved");
  });

  it("CL-1.0 with zero maxVelocityMps is valid (boundary)", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 0 },
    };
    const result = validateConstraintEnvelope(envelope);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveConstraints
// ---------------------------------------------------------------------------
describe("resolveEffectiveConstraints", () => {
  it("CL-1.0 physical.maxVelocityMps takes priority over legacy maxVelocityMps", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 0.3 },
      maxVelocityMps: 1.0,
    };
    const effective = resolveEffectiveConstraints(envelope);
    expect(effective.maxVelocityMps).toBe(0.3);
  });

  it("CL-1.0 execution.corridorId takes priority over legacy corridorId", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      execution: { corridorId: "structured-corridor" },
      corridorId: "legacy-corridor",
    };
    const effective = resolveEffectiveConstraints(envelope);
    expect(effective.corridorId).toBe("structured-corridor");
  });

  it("falls back to legacy fields when CL-1.0 fields missing", () => {
    const envelope: ConstraintEnvelope = {
      maxVelocityMps: 1.5,
      maxForceNewtons: 200,
      corridorId: "legacy-c",
      maxDeviationMeters: 0.8,
    };
    const effective = resolveEffectiveConstraints(envelope);
    expect(effective.maxVelocityMps).toBe(1.5);
    expect(effective.maxForceNewtons).toBe(200);
    expect(effective.corridorId).toBe("legacy-c");
    expect(effective.maxDeviationMeters).toBe(0.8);
  });

  it("mixed CL-1.0 + legacy: structured wins", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxForceNewtons: 50 },
      maxForceNewtons: 100,
      execution: { maxDeviationMeters: 0.1 },
      maxDeviationMeters: 0.5,
    };
    const effective = resolveEffectiveConstraints(envelope);
    expect(effective.maxForceNewtons).toBe(50);
    expect(effective.maxDeviationMeters).toBe(0.1);
  });

  it("all undefined returns all undefined", () => {
    const effective = resolveEffectiveConstraints({});
    expect(effective.maxVelocityMps).toBeUndefined();
    expect(effective.maxForceNewtons).toBeUndefined();
    expect(effective.maxDeviationMeters).toBeUndefined();
    expect(effective.corridorId).toBeUndefined();
    expect(effective.requiresHumanPresence).toBeUndefined();
  });

  it("resolves requiresHumanPresence from physical over legacy", () => {
    const envelope: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { requiresHumanPresence: true },
      requiresHumanPresence: false,
    };
    const effective = resolveEffectiveConstraints(envelope);
    expect(effective.requiresHumanPresence).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeConstraintEnvelopes
// ---------------------------------------------------------------------------
describe("mergeConstraintEnvelopes", () => {
  it("takes minimum of maxVelocityMps", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 1.0 },
    };
    const override: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 0.5 },
    };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.physical?.maxVelocityMps).toBe(0.5);
  });

  it("takes minimum of maxForceNewtons", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxForceNewtons: 200 },
    };
    const override: Partial<ConstraintEnvelope> = {
      physical: { maxForceNewtons: 100 },
    };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.physical?.maxForceNewtons).toBe(100);
  });

  it("takes minimum of rateLimit.maxCalls", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { rateLimit: { maxCalls: 30, windowMs: 60000 } },
    };
    const override: Partial<ConstraintEnvelope> = {
      physical: { rateLimit: { maxCalls: 10, windowMs: 60000 } },
    };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.physical?.rateLimit?.maxCalls).toBe(10);
  });

  it("base without rateLimit, override with rateLimit uses override", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 1.0 },
    };
    const override: Partial<ConstraintEnvelope> = {
      physical: { rateLimit: { maxCalls: 5, windowMs: 30000 } },
    };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.physical?.rateLimit).toEqual({ maxCalls: 5, windowMs: 30000 });
  });

  it("override without rateLimit uses base", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { rateLimit: { maxCalls: 20, windowMs: 60000 } },
    };
    const override: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 0.5 },
    };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.physical?.rateLimit).toEqual({ maxCalls: 20, windowMs: 60000 });
  });

  it("behavioral maxPayloadBytes takes minimum", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      behavioral: { maxPayloadBytes: 65536 },
    };
    const override: Partial<ConstraintEnvelope> = {
      behavioral: { maxPayloadBytes: 32768 },
    };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.behavioral?.maxPayloadBytes).toBe(32768);
  });

  it("preserves base version and mode", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      mode: "dynamic-runtime",
      dynamic: { tightenOnly: true },
    };
    const override: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 0.3 },
    };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.version).toBe("cl-1.0");
    expect(merged.mode).toBe("dynamic-runtime");
  });

  it("merges legacy maxVelocityMps with minimum", () => {
    const base: ConstraintEnvelope = { maxVelocityMps: 2.0 };
    const override: Partial<ConstraintEnvelope> = { maxVelocityMps: 1.0 };
    const merged = mergeConstraintEnvelopes(base, override);
    expect(merged.maxVelocityMps).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// checkTightenOnlyViolations
// ---------------------------------------------------------------------------
describe("checkTightenOnlyViolations", () => {
  it("no violations when proposed is tighter", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 1.0, maxForceNewtons: 200 },
    };
    const proposed: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 0.5, maxForceNewtons: 100 },
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(0);
  });

  it("violation when proposed maxVelocityMps > base", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 0.5 },
    };
    const proposed: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 1.0 },
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("physical.maxVelocityMps");
  });

  it("violation when proposed maxForceNewtons > base", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxForceNewtons: 100 },
    };
    const proposed: Partial<ConstraintEnvelope> = {
      physical: { maxForceNewtons: 200 },
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("physical.maxForceNewtons");
  });

  it("multiple violations returned", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 0.5, maxForceNewtons: 100 },
      behavioral: { maxPayloadBytes: 1024 },
    };
    const proposed: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 2.0, maxForceNewtons: 300 },
      behavioral: { maxPayloadBytes: 4096 },
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(3);
  });

  it("no violation when values are equal", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { maxVelocityMps: 1.0 },
    };
    const proposed: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 1.0 },
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(0);
  });

  it("no violation when base field is undefined (no constraint to violate)", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
    };
    const proposed: Partial<ConstraintEnvelope> = {
      physical: { maxVelocityMps: 5.0 },
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(0);
  });

  it("detects rateLimit widening violations", () => {
    const base: ConstraintEnvelope = {
      version: "cl-1.0",
      physical: { rateLimit: { maxCalls: 10, windowMs: 30000 } },
    };
    const proposed: Partial<ConstraintEnvelope> = {
      physical: { rateLimit: { maxCalls: 50, windowMs: 60000 } },
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain("physical.rateLimit.maxCalls");
    expect(violations[1]).toContain("physical.rateLimit.windowMs");
  });

  it("detects legacy field widening", () => {
    const base: ConstraintEnvelope = {
      maxVelocityMps: 0.5,
      maxDeviationMeters: 0.2,
    };
    const proposed: Partial<ConstraintEnvelope> = {
      maxVelocityMps: 1.0,
      maxDeviationMeters: 0.1,
    };
    const violations = checkTightenOnlyViolations(base, proposed);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("maxVelocityMps");
  });
});
