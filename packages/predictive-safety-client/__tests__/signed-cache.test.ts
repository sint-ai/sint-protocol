import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  canonicalJsonStringify,
  type SimulationEvidenceReceipt,
  type SimulationPreflight,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { generateKeypair, sign } from "@pshkv/gate-capability-tokens";
import { HttpEffectSimulator } from "../src/index.js";

const digest = (character: string): string => character.repeat(64);

const preflight: SimulationPreflight = {
  kind: "simulation-preflight",
  authorizesExecution: false,
  assignedTier: ApprovalTier.T2_ACT,
  effectPlan: {
    requestDigest: digest("1"),
    effectPlanDigest: digest("2"),
    tokenDigest: digest("3"),
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
  },
};

function world(character: string): SimulationWorldSnapshot {
  return {
    digest: digest(character),
    observedAt: "2026-11-13T23:00:00.000Z",
    validUntil: "2026-11-13T23:10:00.000Z",
  };
}

function signedReceipt(
  signer: { readonly publicKey: string; readonly privateKey: string },
  worldDigest: string,
  modelDigest: string,
): SimulationEvidenceReceipt {
  const unsigned = {
    schemaVersion: "2.0.0" as const,
    receiptId: "01900000-0000-7000-8000-000000000001",
    evidenceGrade: "deterministic" as const,
    requestDigest: preflight.effectPlan.requestDigest,
    effectPlanDigest: preflight.effectPlan.effectPlanDigest,
    tokenDigest: preflight.effectPlan.tokenDigest,
    resource: preflight.effectPlan.resource,
    action: preflight.effectPlan.action,
    worldSnapshot: {
      digest: worldDigest,
      observedAt: "2026-11-13T23:00:00.000Z",
      validUntil: "2026-11-13T23:10:00.000Z",
    },
    simulator: {
      backend: "remote-test",
      version: "1",
      modelDigest,
    },
    scenarios: {
      scenarioSetDigest: digest("4"),
      runCount: 1,
    },
    result: {
      outcome: "pass" as const,
      collisions: 0,
      safetyZoneViolations: 0,
    },
    generatedAt: "2026-11-13T23:00:01.000Z",
    expiresAt: "2026-11-13T23:10:00.000Z",
    nonce: "nonce-0000000000000001",
    artifactDigest: digest("5"),
    signerPublicKey: signer.publicKey,
  };
  return {
    ...unsigned,
    signature: sign(signer.privateKey, canonicalJsonStringify(unsigned)),
  };
}

function receiptCache() {
  const stored = new Map<string, SimulationEvidenceReceipt>();
  const keyOf = (key: {
    effectPlanDigest: string;
    worldDigest: string;
    modelDigest: string;
  }) => `${key.effectPlanDigest}.${key.worldDigest}.${key.modelDigest}`;
  return {
    get(key: { effectPlanDigest: string; worldDigest: string; modelDigest: string }) {
      return stored.get(keyOf(key));
    },
    set(
      key: { effectPlanDigest: string; worldDigest: string; modelDigest: string },
      receipt: SimulationEvidenceReceipt,
    ) {
      stored.set(keyOf(key), receipt);
    },
  };
}

describe("signed simulation receipt cache", () => {
  it("does not call the worker again for the same plan, world, and model", async () => {
    const signer = generateKeypair();
    const modelDigest = digest("b");
    const snapshot = world("a");
    const receipt = signedReceipt(signer, snapshot.digest, modelDigest);
    let calls = 0;
    const simulator = new HttpEffectSimulator({
      baseUrl: "http://worker/",
      backend: "remote-test",
      supportedGrades: ["deterministic"],
      trustedSignerKeys: [signer.publicKey],
      modelDigest,
      receiptCache: receiptCache(),
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ receipt }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const first = await simulator.simulate(preflight, snapshot);
    const second = await simulator.simulate(preflight, snapshot);

    expect(first.ok).toBe(true);
    expect(calls).toBe(1);
    expect(second.ok ? second.value.receiptId : undefined).toBe(receipt.receiptId);
  });
});
