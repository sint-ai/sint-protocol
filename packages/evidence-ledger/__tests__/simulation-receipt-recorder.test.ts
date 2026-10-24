import { describe, expect, it } from "vitest";
import {
  canonicalJsonStringify,
  type SimulationEvidenceReceipt,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  hashSha256,
  sign,
} from "@pshkv/gate-capability-tokens";
import {
  EvidenceLedgerSimulationReceiptRecorder,
  LedgerWriter,
} from "../src/index.js";

const signer = generateKeypair();
const now = Date.now();
const digest = (character: string): string => character.repeat(64);

function receipt(): SimulationEvidenceReceipt {
  const unsigned: SimulationEvidenceReceipt = {
    schemaVersion: "2.0.0",
    receiptId: generateUUIDv7(),
    evidenceGrade: "deterministic",
    requestDigest: digest("1"),
    effectPlanDigest: digest("2"),
    tokenDigest: digest("3"),
    resource: "ros2:///cmd_vel",
    action: "publish",
    worldSnapshot: {
      digest: digest("4"),
      observedAt: new Date(now - 10).toISOString(),
      validUntil: new Date(now + 5_000).toISOString(),
      stateEpoch: "robot:42",
      uncertainty: 0.01,
    },
    simulator: {
      backend: "sint-deterministic",
      version: "0.1.0",
      modelDigest: digest("5"),
    },
    scenarios: {
      scenarioSetDigest: digest("6"),
      runCount: 1,
      coverage: 1,
      seeds: [],
    },
    result: {
      outcome: "pass",
      collisions: 0,
      safetyZoneViolations: 0,
      maxVelocityMps: 0.2,
    },
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5_000).toISOString(),
    nonce: `simulation:${generateUUIDv7()}`,
    artifactDigest: digest("7"),
    signerPublicKey: signer.publicKey,
    signature: "0".repeat(128),
  };
  const { signature: _signature, ...payload } = unsigned;
  return { ...unsigned, signature: sign(signer.privateKey, canonicalJsonStringify(payload)) };
}

describe("EvidenceLedgerSimulationReceiptRecorder", () => {
  it("appends the exact signed receipt digest as a non-authorizing issuance event", async () => {
    const ledger = new LedgerWriter();
    const recorder = new EvidenceLedgerSimulationReceiptRecorder(ledger);
    const issued = receipt();

    const recorded = await recorder.recordIssued(issued);

    expect(recorded).toEqual({ ok: true, value: undefined });
    expect(ledger.getAll()).toEqual([
      expect.objectContaining({
        eventType: "simulation.receipt.issued",
        agentId: issued.signerPublicKey,
        payload: expect.objectContaining({
          receiptId: issued.receiptId,
          receiptDigest: hashSha256(canonicalJsonStringify(issued)),
          effectPlanDigest: issued.effectPlanDigest,
          artifactDigest: issued.artifactDigest,
          authorizesExecution: false,
        }),
      }),
    ]);
    expect(ledger.verifyChain()).toEqual({ ok: true, value: true });
  });

  it("returns a typed failure when the append-only ledger cannot accept the event", async () => {
    const unavailable = {
      append() {
        throw new Error("storage unavailable");
      },
    } as LedgerWriter;
    const recorder = new EvidenceLedgerSimulationReceiptRecorder(unavailable);

    const recorded = await recorder.recordIssued(receipt());

    expect(recorded).toEqual({
      ok: false,
      error: {
        code: "EVIDENCE_LEDGER_WRITE_FAILED",
        message: "Failed to append simulation receipt issuance: storage unavailable",
      },
    });
  });

  it("fails issuance when durable ledger persistence rejects the appended event", async () => {
    const ledger = new LedgerWriter();
    const recorder = new EvidenceLedgerSimulationReceiptRecorder(ledger, async () => {
      throw new Error("postgres unavailable");
    });

    const recorded = await recorder.recordIssued(receipt());

    expect(recorded).toEqual({
      ok: false,
      error: {
        code: "EVIDENCE_LEDGER_WRITE_FAILED",
        message: "Failed to append simulation receipt issuance: postgres unavailable",
      },
    });
    expect(ledger.length).toBe(1);
  });
});
