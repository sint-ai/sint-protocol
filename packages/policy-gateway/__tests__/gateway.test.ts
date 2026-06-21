/**
 * SINT Protocol — PolicyGateway unit tests.
 *
 * Tests the single choke point through which every agent action flows.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import type { SintCapabilityToken, SintCapabilityTokenRequest, SintRequest } from "@pshkv/core";
import { ApprovalTier } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeRequest(
  overrides: Partial<SintRequest> & { tokenId: string; agentId: string },
): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
    ...overrides,
  };
}

describe("PolicyGateway", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let ledger: LedgerWriter;
  let emitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    ledger = new LedgerWriter();

    emitSpy = vi.fn((event: any) => {
      ledger.append({
        eventType: event.eventType as any,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
    });

    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
    });
  });

  function issueAndStore(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        maxForceNewtons: 50,
        maxVelocityMps: 0.5,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  // ── T0: Sensor subscribe → auto-allow ──

  it("allows T0 sensor subscribe requests", async () => {
    const token = issueAndStore({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
      }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  // ── T1: Navigation plan → auto-allow with audit ──

  it("allows T1 plan publish requests", async () => {
    const token = issueAndStore({
      resource: "ros2:///plan",
      actions: ["publish"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///plan",
        action: "publish",
      }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  // ── T2: cmd_vel publish → escalate ──

  it("escalates T2 cmd_vel publish requests", async () => {
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision.escalation?.fallbackAction).toBe("deny");
  });

  // ── T3: mode_change → escalate with safe-stop ──

  it("escalates T3 mode_change with safe-stop fallback", async () => {
    const token = issueAndStore({
      resource: "ros2:///mode_change",
      actions: ["call"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///mode_change",
        action: "call",
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(decision.escalation?.fallbackAction).toBe("safe-stop");
  });

  // ── Token not found → deny ──

  it("denies request with non-existent token", async () => {
    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: "01905f7c-0000-7000-8000-000000000000",
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("TOKEN_NOT_FOUND");
  });

  // ── Revoked token → deny ──

  it("denies request with revoked token", async () => {
    const token = issueAndStore();
    revocationStore.revoke(token.tokenId, "Security incident", "admin");

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("TOKEN_REVOKED");
  });

  it("denies request when token subject does not match agent identity", async () => {
    const token = issueAndStore();
    const otherAgent = generateKeypair();

    const decision = await gateway.intercept(
      makeRequest({
        agentId: otherAgent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("TOKEN_SUBJECT_MISMATCH");
  });

  // ── Wrong resource → deny ──

  it("denies request for unauthorized resource", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///mode_change",
        action: "call",
      }),
    );

    expect(decision.action).toBe("deny");
  });

  // ── Force violation → deny ──

  it("denies request exceeding force constraint", async () => {
    const token = issueAndStore({
      constraints: { maxForceNewtons: 50 },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        params: { force: 75 },
      }),
    );

    expect(decision.action).toBe("deny");
  });

  it("denies request when preapproved corridor does not match token execution envelope", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "corridor-a",
        expiresAt: futureISO(1),
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          preapprovedCorridor: {
            corridorId: "corridor-b",
            expiresAt: futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });

  it("denies request when corridor mission type does not match token envelope", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "rescue-corridor-a",
        missionType: "civilian_rescue",
        expiresAt: futureISO(1),
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          preapprovedCorridor: {
            corridorId: "rescue-corridor-a",
            missionType: "combat",
            expiresAt: futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });

  it("denies spatial-envelope request when localization proof is missing", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "logistics-corridor-a",
        missionType: "logistics",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxLocalizationAgeMs: 1_000,
        minLocalizationConfidence: 0.9,
        frameId: "map",
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          preapprovedCorridor: {
            corridorId: "logistics-corridor-a",
            missionType: "logistics",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_PROOF_REQUIRED");
  });

  it("denies spatial-envelope request when localization confidence is too low", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "evac-corridor-a",
        missionType: "casualty_evac",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        minLocalizationConfidence: 0.95,
        frameId: "map",
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 1, y: 2, z: 0 },
          localizationConfidence: 0.72,
          localizationObservedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
          frameId: "map",
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "evac-corridor-a",
            missionType: "casualty_evac",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_CONFIDENCE_LOW");
  });

  it("denies spatial-envelope request when localization evidence is stale", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "rescue-corridor-b",
        missionType: "civilian_rescue",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxLocalizationAgeMs: 1_000,
        minLocalizationConfidence: 0.9,
        frameId: "map",
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 1, y: 2, z: 0 },
          localizationConfidence: 0.99,
          localizationObservedAt: futureISO(-1),
          frameId: "map",
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "rescue-corridor-b",
            missionType: "civilian_rescue",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_PROOF_STALE");
  });

  it("escalates spatial-envelope T2 action when localization proof is fresh and confident", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "logistics-corridor-b",
        missionType: "logistics",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxLocalizationAgeMs: 5_000,
        minLocalizationConfidence: 0.9,
        frameId: "map",
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 1, y: 2, z: 0 },
          localizationConfidence: 0.99,
          localizationObservedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
          frameId: "map",
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "logistics-corridor-b",
            missionType: "logistics",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("denies spatial-envelope request with deviation limits when no corridor verifier is configured", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "warehouse-aisle-7",
        missionType: "logistics",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxDeviationMeters: 0.25,
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 1, y: 0.1, z: 0 },
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "warehouse-aisle-7",
            missionType: "logistics",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_CORRIDOR_VERIFIER_REQUIRED");
  });

  it("denies spatial-envelope request when corridor verifier reports outside corridor", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "rescue-lane-3",
        missionType: "civilian_rescue",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxDeviationMeters: 0.5,
      },
    });
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      spatialCorridorVerifier: {
        verifyCorridor: vi.fn().mockResolvedValue({
          verified: true,
          insideCorridor: false,
          lateralDeviationMeters: 1.7,
          verifierRef: "signed-corridor-map:v1",
          reason: "position outside signed rescue lane",
        }),
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 10, y: 4, z: 0 },
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "rescue-lane-3",
            missionType: "civilian_rescue",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_CORRIDOR_VIOLATION");
    expect(
      emitSpy.mock.calls.some((call) => call[0]?.eventType === "policy.spatial.corridor_violation"),
    ).toBe(true);
  });

  it("denies spatial-envelope request when corridor verifier throws", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "evac-route-12",
        missionType: "casualty_evac",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxDeviationMeters: 0.5,
      },
    });
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      spatialCorridorVerifier: {
        verifyCorridor: vi.fn().mockRejectedValue(new Error("map server unavailable")),
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 2, y: 0.2, z: 0 },
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "evac-route-12",
            missionType: "casualty_evac",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_CORRIDOR_VERIFICATION_FAILED");
  });

  it("escalates spatial-envelope T2 action when corridor geometry is verified within token limits", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "warehouse-aisle-9",
        missionType: "logistics",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxDeviationMeters: 0.5,
        maxHeadingDeviationDeg: 15,
      },
    });
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      spatialCorridorVerifier: {
        verifyCorridor: vi.fn().mockResolvedValue({
          verified: true,
          insideCorridor: true,
          lateralDeviationMeters: 0.2,
          headingDeviationDeg: 8,
          verifierRef: "signed-corridor-map:v1",
        }),
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 3, y: 0.2, z: 0 },
          currentHeadingDeg: 8,
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "warehouse-aisle-9",
            missionType: "logistics",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(
      emitSpy.mock.calls.some((call) => call[0]?.eventType === "policy.spatial.corridor_verified"),
    ).toBe(true);
  });

  it("denies spatial-envelope request when verified heading exceeds token limit", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      executionEnvelope: {
        corridorId: "warehouse-aisle-10",
        missionType: "logistics",
        expiresAt: futureISO(1),
        requiresSpatialProof: true,
        maxDeviationMeters: 0.5,
        maxHeadingDeviationDeg: 10,
      },
    });
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      spatialCorridorVerifier: {
        verifyCorridor: vi.fn().mockResolvedValue({
          verified: true,
          insideCorridor: true,
          lateralDeviationMeters: 0.1,
          headingDeviationDeg: 22,
          verifierRef: "signed-corridor-map:v1",
        }),
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        physicalContext: {
          currentPosition: { x: 3, y: 0.1, z: 0 },
          currentHeadingDeg: 22,
        },
        executionContext: {
          preapprovedCorridor: {
            corridorId: "warehouse-aisle-10",
            missionType: "logistics",
            expiresAt: token.executionEnvelope?.expiresAt ?? futureISO(1),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SPATIAL_CORRIDOR_HEADING");
  });

  it("denies immediately when hardware emergency-stop is triggered", async () => {
    const token = issueAndStore({
      resource: "ros2:///plan",
      actions: ["publish"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///plan",
        action: "publish",
        executionContext: {
          hardwareSafety: {
            estopState: "triggered",
            observedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
    expect(
      emitSpy.mock.calls.some((call) => call[0]?.eventType === "safety.estop.triggered"),
    ).toBe(true);
  });

  it("denies industrial T2 action when hardware safety context is missing", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          deploymentProfile: "industrial-cell",
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
  });

  it("denies industrial T2 action when permit is not granted", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "denied",
            interlockState: "closed",
            observedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
  });

  it("allows normal escalation when industrial hardware permit/interlock are healthy", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          deploymentProfile: "industrial-cell",
          hardwareSafety: {
            permitState: "granted",
            interlockState: "closed",
            observedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
          },
        },
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("denies T2 action when verifiable compute proof is required but missing", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      verifiableComputeRequirements: {
        requireForTiers: [ApprovalTier.T2_ACT],
        allowedProofTypes: ["risc0-groth16"],
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });

  it("allows normal T2 escalation when required verifiable compute proof metadata is present", async () => {
    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      verifiableComputeRequirements: {
        requireForTiers: [ApprovalTier.T2_ACT],
        allowedProofTypes: ["risc0-groth16"],
        maxProofAgeMs: 60_000,
        requirePublicInputsHash: true,
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          verifiableCompute: {
            proofType: "risc0-groth16",
            proofRef: "proof://robotics/receipt-001",
            proofHash: "a".repeat(64),
            publicInputsHash: "b".repeat(64),
            generatedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
          },
        },
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(
      emitSpy.mock.calls.some(
        (call) => call[0]?.eventType === "verifiable.compute.verified",
      ),
    ).toBe(true);
  });

  it("denies when verifiable compute proof exceeds maxProofAgeMs", async () => {
    const verifier = vi.fn().mockResolvedValue({ verified: true as const });
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      verifiableCompute: { verify: verifier },
    });

    const token = issueAndStore({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      verifiableComputeRequirements: {
        requireForTiers: [ApprovalTier.T2_ACT],
        allowedProofTypes: ["snark"],
        maxProofAgeMs: 5_000,
      },
    });

    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        executionContext: {
          verifiableCompute: {
            proofType: "snark",
            proofRef: "proof://robotics/stale",
            proofHash: "c".repeat(64),
            generatedAt: new Date(Date.now() - 60_000)
              .toISOString()
              .replace(/\.(\d{3})Z$/, ".$1000Z"),
          },
        },
      }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
    expect(verifier).not.toHaveBeenCalled();
  });

  // ── Forbidden combo → escalate ──

  it("escalates on forbidden tool combination", async () => {
    // Token that allows exec.run on an MCP resource
    const token = issueAndStore({
      resource: "mcp://server/exec",
      actions: ["exec.run"],
    });

    // "filesystem.write" followed by "exec.run" is a forbidden combo
    const decision = await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "mcp://server/exec",
        action: "exec.run",
        recentActions: ["filesystem.write"],
      }),
    );

    expect(decision.action).toBe("escalate");
    expect(decision.escalation?.requiredTier).toBe(ApprovalTier.T3_COMMIT);
  });

  // ── Ledger events ──

  it("emits ledger event for every evaluated request", async () => {
    const token = issueAndStore({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
      }),
    );

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "policy.evaluated",
        agentId: agent.publicKey,
      }),
    );
  });

  // ── No revocation store → skip check ──

  it("works without revocation store configured", async () => {
    const noRevokeGateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
    });

    const token = issueAndStore({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    const decision = await noRevokeGateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
      }),
    );

    expect(decision.action).toBe("allow");
  });
});
