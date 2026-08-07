import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  type Ed25519PublicKey,
  type SimulationEvidenceReceipt,
  type SintEventType,
  type SintRequest,
  type UUIDv7,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  sign,
} from "@pshkv/gate-capability-tokens";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import {
  DefaultSimulationEvidencePolicy,
  PolicyGateway,
  computeSimulationEffectPlanDigest,
  computeSimulationEvidenceSigningPayload,
  computeSimulationRequestDigest,
  computeSimulationTokenDigest,
} from "@pshkv/gate-policy-gateway";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(
  ROOT,
  "packages/conformance-tests/fixtures/predictive-safety/t1-shadow-evaluation.v1.json",
);

interface ShadowFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly token: { readonly resource: string; readonly action: string };
  readonly cases: readonly Array<{
    readonly id: string;
    readonly params: Record<string, unknown>;
    readonly evidence: "missing" | "unsafe" | "pass";
    readonly expectedDecision: "allow";
    readonly expectedEvent: "simulation.receipt.rejected" | "simulation.receipt.verified";
    readonly expectedViolation?: string;
  }>;
  readonly promotionRule: string;
  readonly conformanceCommand: string;
}

function fixture(): ShadowFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ShadowFixture;
}

const now = Date.now();
const issuer = generateKeypair();
const agent = generateKeypair();
const simulator = generateKeypair();

function receiptFor(
  request: SintRequest,
  token: Parameters<typeof computeSimulationTokenDigest>[0],
  outcome: "pass" | "fail",
): SimulationEvidenceReceipt {
  const unsigned: SimulationEvidenceReceipt = {
    schemaVersion: "2.0.0",
    receiptId: generateUUIDv7(),
    evidenceGrade: "deterministic",
    requestDigest: computeSimulationRequestDigest(request),
    effectPlanDigest: computeSimulationEffectPlanDigest(request),
    tokenDigest: computeSimulationTokenDigest(token),
    resource: request.resource,
    action: request.action,
    worldSnapshot: {
      digest: "1".repeat(64),
      observedAt: new Date(now - 25).toISOString(),
      validUntil: new Date(now + 5_000).toISOString(),
      stateEpoch: "fixture:1",
      uncertainty: 0,
    },
    simulator: {
      backend: "filesystem-overlay",
      version: "fixture-v1",
      modelDigest: "2".repeat(64),
    },
    scenarios: {
      scenarioSetDigest: "3".repeat(64),
      runCount: 1,
      coverage: 1,
      seeds: [1],
    },
    result: { outcome, collisions: 0, safetyZoneViolations: 0 },
    generatedAt: new Date(now - 10).toISOString(),
    expiresAt: new Date(now + 5_000).toISOString(),
    nonce: `fixture-${generateUUIDv7()}`,
    artifactDigest: "4".repeat(64),
    signerPublicKey: simulator.publicKey,
    signature: "0".repeat(128),
  };
  return {
    ...unsigned,
    signature: sign(simulator.privateKey, computeSimulationEvidenceSigningPayload(unsigned)),
  };
}

describe("Predictive Safety Plane T1 shadow conformance", () => {
  it("keeps the recorded fixture explicitly non-authorizing", () => {
    const data = fixture();
    expect(data.fixtureId).toBe("predictive-safety-t1-shadow-v1");
    expect(data.schemaVersion).toBe("1.0.0");
    expect(data.promotionRule).toContain("never authorize or block");
    expect(data.conformanceCommand).toContain("predictive-safety-shadow-conformance.test.ts");
  });

  it("evaluates recorded T1 actions without blocking and preserves the evidence chain", async () => {
    const data = fixture();
    const issued = issueCapabilityToken({
      issuer: issuer.publicKey,
      subject: agent.publicKey,
      resource: data.token.resource,
      actions: [data.token.action],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: new Date(now + 60_000).toISOString(),
      revocable: false,
    }, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const ledger = new LedgerWriter();
    const gateway = new PolicyGateway({
      resolveToken: () => issued.value,
      emitLedgerEvent: (event) => ledger.append({
        eventType: event.eventType as SintEventType,
        agentId: event.agentId as Ed25519PublicKey,
        tokenId: event.tokenId as UUIDv7 | undefined,
        payload: event.payload,
      }),
      simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
        trustedSignerKeys: [simulator.publicKey],
        allowedBackends: ["filesystem-overlay"],
        tierRequirements: {
          [ApprovalTier.T1_PREPARE]: { minEvidenceGrade: "deterministic" },
        },
        shadowTiers: [ApprovalTier.T1_PREPARE],
        now: () => now,
      }),
    });

    for (const scenario of data.cases) {
      const request: SintRequest = {
        requestId: generateUUIDv7(),
        timestamp: new Date(now).toISOString(),
        agentId: agent.publicKey,
        tokenId: issued.value.tokenId,
        resource: data.token.resource,
        action: data.token.action,
        params: scenario.params,
      };
      const evidence = scenario.evidence === "missing"
        ? undefined
        : receiptFor(request, issued.value, scenario.evidence === "pass" ? "pass" : "fail");
      const before = ledger.length;
      const decision = await gateway.intercept(evidence
        ? { ...request, executionContext: { simulationEvidence: evidence } }
        : request);
      const simulationEvents = ledger.getAll()
        .slice(before)
        .filter((event) => event.eventType.startsWith("simulation.receipt."));

      expect(decision.action, scenario.id).toBe(scenario.expectedDecision);
      expect(decision.assignedTier, scenario.id).toBe(ApprovalTier.T1_PREPARE);
      expect(simulationEvents, scenario.id).toHaveLength(1);
      expect(simulationEvents[0]?.eventType, scenario.id).toBe(scenario.expectedEvent);
      expect(simulationEvents[0]?.payload.enforcementMode, scenario.id).toBe("shadow");
      expect(simulationEvents[0]?.payload.policyViolated, scenario.id).toBe(scenario.expectedViolation);
    }

    expect(ledger.verifyChain()).toEqual({ ok: true, value: true });
  });
});
