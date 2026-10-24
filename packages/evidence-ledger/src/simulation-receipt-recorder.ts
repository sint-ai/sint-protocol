import {
  canonicalJsonStringify,
  err,
  ok,
  type Result,
  type SimulationEvidenceReceipt,
  type SimulationReceiptRecorder,
  type SimulationReceiptRecorderError,
  type SintLedgerEvent,
} from "@pshkv/core";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type { LedgerWriter } from "./writer.js";

function digestReceipt(receipt: SimulationEvidenceReceipt): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJsonStringify(receipt))));
}

/** Records the exact signed receipt before it crosses the simulator boundary. */
export class EvidenceLedgerSimulationReceiptRecorder implements SimulationReceiptRecorder {
  constructor(
    private readonly ledger: LedgerWriter,
    private readonly persist?: (event: SintLedgerEvent) => Promise<void>,
  ) {}

  async recordIssued(
    receipt: SimulationEvidenceReceipt,
  ): Promise<Result<void, SimulationReceiptRecorderError>> {
    try {
      const event = this.ledger.append({
        eventType: "simulation.receipt.issued",
        agentId: receipt.signerPublicKey,
        payload: {
          receiptId: receipt.receiptId,
          receiptDigest: digestReceipt(receipt),
          evidenceGrade: receipt.evidenceGrade,
          requestDigest: receipt.requestDigest,
          effectPlanDigest: receipt.effectPlanDigest,
          tokenDigest: receipt.tokenDigest,
          worldSnapshotDigest: receipt.worldSnapshot.digest,
          artifactDigest: receipt.artifactDigest,
          simulator: receipt.simulator,
          scenarios: receipt.scenarios,
          outcome: receipt.result.outcome,
          generatedAt: receipt.generatedAt,
          expiresAt: receipt.expiresAt,
          authorizesExecution: false,
        },
      });
      await this.persist?.(event);
      return ok(undefined);
    } catch (cause) {
      return err({
        code: "EVIDENCE_LEDGER_WRITE_FAILED",
        message: `Failed to append simulation receipt issuance: ${cause instanceof Error ? cause.message : "unknown ledger error"}`,
      });
    }
  }
}
