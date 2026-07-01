import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  issueCapabilityToken,
  delegateCapabilityToken,
  validateCapabilityToken,
} from "../src/index.js";
import type { SintCapabilityTokenRequest } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Capability Token Delegator", () => {
  const root = generateKeypair();
  const agent1 = generateKeypair();
  const agent2 = generateKeypair();
  const agent3 = generateKeypair();
  const agent4 = generateKeypair();
  const agent5 = generateKeypair();

  function issueRootToken() {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent1.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish", "subscribe"],
      constraints: {
        maxForceNewtons: 100,
        maxVelocityMps: 1.0,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(24),
      revocable: true,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error("Failed to issue root token");
    return result.value;
  }

  function issueRegulatedRootToken(
    regulatedDataPolicyOverrides: Partial<NonNullable<SintCapabilityTokenRequest["regulatedDataPolicy"]>> = {},
  ) {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent1.publicKey,
      resource: "health://intake/*",
      actions: ["read", "summarize"],
      constraints: {},
      regulatedDataPolicy: {
        allowedDataClasses: ["PHI", "PII"],
        allowedPurposes: ["TREAT", "PAYMENT"],
        approvedProcessors: ["ehr-core", "in-region-model-router"],
        approvedRegions: ["us-east-1", "us-west-2"],
        approvedModels: ["clinical-summary-local", "billing-code-helper"],
        allowedContextFields: ["symptoms", "medications", "insurance_plan"],
        allowFallback: true,
        ...regulatedDataPolicyOverrides,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(24),
      revocable: true,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error("Failed to issue regulated root token");
    return result.value;
  }

  it("should delegate with attenuated constraints", () => {
    const rootToken = issueRootToken();

    const result = delegateCapabilityToken(
      rootToken,
      {
        newSubject: agent2.publicKey,
        tightenConstraints: { maxVelocityMps: 0.5 },
      },
      agent1.privateKey,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.subject).toBe(agent2.publicKey);
    expect(result.value.delegationChain.depth).toBe(1);
    expect(result.value.delegationChain.attenuated).toBe(true);
    expect(result.value.constraints.maxVelocityMps).toBe(0.5);
    expect(result.value.constraints.maxForceNewtons).toBe(100);
  });

  it("should restrict actions during delegation", () => {
    const rootToken = issueRootToken();

    const result = delegateCapabilityToken(
      rootToken,
      {
        newSubject: agent2.publicKey,
        restrictActions: ["subscribe"], // Remove "publish"
      },
      agent1.privateKey,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.actions).toEqual(["subscribe"]);
  });

  it("should reject delegation beyond max depth (4+ hops)", () => {
    const rootToken = issueRootToken();

    // Delegate 1 -> 2
    const d1 = delegateCapabilityToken(
      rootToken,
      { newSubject: agent2.publicKey },
      agent1.privateKey,
    );
    expect(d1.ok).toBe(true);
    if (!d1.ok) return;

    // Delegate 2 -> 3
    const d2 = delegateCapabilityToken(
      d1.value,
      { newSubject: agent3.publicKey },
      agent2.privateKey,
    );
    expect(d2.ok).toBe(true);
    if (!d2.ok) return;

    // Delegate 3 -> 4 (depth = 3, at max)
    const d3 = delegateCapabilityToken(
      d2.value,
      { newSubject: agent4.publicKey },
      agent3.privateKey,
    );
    expect(d3.ok).toBe(true);
    if (!d3.ok) return;
    expect(d3.value.delegationChain.depth).toBe(3);

    // Delegate 4 -> 5 (depth = 4, EXCEEDS max)
    const d4 = delegateCapabilityToken(
      d3.value,
      { newSubject: agent5.publicKey },
      agent4.privateKey,
    );
    expect(d4.ok).toBe(false);
    if (d4.ok) return;
    expect(d4.error).toBe("DELEGATION_DEPTH_EXCEEDED");
  });

  it("should produce delegated tokens that pass validation", () => {
    const rootToken = issueRootToken();

    const delegated = delegateCapabilityToken(
      rootToken,
      {
        newSubject: agent2.publicKey,
        tightenConstraints: { maxVelocityMps: 0.3 },
      },
      agent1.privateKey,
    );
    expect(delegated.ok).toBe(true);
    if (!delegated.ok) return;

    const valid = validateCapabilityToken(delegated.value, {
      resource: "ros2:///cmd_vel",
      action: "publish",
      physicalContext: { commandedVelocityMps: 0.2 },
    });
    expect(valid.ok).toBe(true);
  });

  it("should reject delegated token used beyond its tightened constraints", () => {
    const rootToken = issueRootToken();

    const delegated = delegateCapabilityToken(
      rootToken,
      {
        newSubject: agent2.publicKey,
        tightenConstraints: { maxVelocityMps: 0.3 },
      },
      agent1.privateKey,
    );
    expect(delegated.ok).toBe(true);
    if (!delegated.ok) return;

    // Try to use at 0.8 m/s — parent allows 1.0 but delegated only allows 0.3
    const valid = validateCapabilityToken(delegated.value, {
      resource: "ros2:///cmd_vel",
      action: "publish",
      physicalContext: { commandedVelocityMps: 0.8 },
    });
    expect(valid.ok).toBe(false);
  });

  it("should delegate with attenuated regulated data policy", () => {
    const rootToken = issueRegulatedRootToken();

    const delegated = delegateCapabilityToken(
      rootToken,
      {
        newSubject: agent2.publicKey,
        restrictActions: ["summarize"],
        tightenRegulatedDataPolicy: {
          allowedDataClasses: ["PHI"],
          allowedPurposes: ["TREAT"],
          approvedProcessors: ["in-region-model-router"],
          approvedRegions: ["us-east-1"],
          approvedModels: ["clinical-summary-local"],
          allowedContextFields: ["symptoms"],
          allowFallback: false,
        },
      },
      agent1.privateKey,
    );

    expect(delegated.ok).toBe(true);
    if (!delegated.ok) return;
    expect(delegated.value.regulatedDataPolicy).toEqual({
      allowedDataClasses: ["PHI"],
      allowedPurposes: ["TREAT"],
      approvedProcessors: ["in-region-model-router"],
      approvedRegions: ["us-east-1"],
      approvedModels: ["clinical-summary-local"],
      allowedContextFields: ["symptoms"],
      allowFallback: false,
    });
  });

  it("should reject regulated data policy expansion during delegation", () => {
    const rootToken = issueRegulatedRootToken();

    const delegated = delegateCapabilityToken(
      rootToken,
      {
        newSubject: agent2.publicKey,
        tightenRegulatedDataPolicy: {
          approvedProcessors: ["unapproved-processor"],
        },
      },
      agent1.privateKey,
    );

    expect(delegated.ok).toBe(false);
    if (delegated.ok) return;
    expect(delegated.error).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("should reject enabling fallback when parent disabled it", () => {
    const rootToken = issueRegulatedRootToken({ allowFallback: false });

    const delegated = delegateCapabilityToken(
      rootToken,
      {
        newSubject: agent2.publicKey,
        tightenRegulatedDataPolicy: {
          allowFallback: true,
        },
      },
      agent1.privateKey,
    );

    expect(delegated.ok).toBe(false);
    if (delegated.ok) return;
    expect(delegated.error).toBe("INSUFFICIENT_PERMISSIONS");
  });
});
