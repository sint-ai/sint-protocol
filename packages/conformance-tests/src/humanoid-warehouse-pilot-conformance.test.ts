/**
 * Humanoid warehouse/RaaS pilot conformance.
 *
 * Defines the first per-shift evidence export contract for design partners and
 * insurance/safety reviewers. The export is derived from hash-chained ledger
 * events, not from ad hoc operational logs.
 */

import { describe, expect, it } from "vitest";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import type { SintEventType, SintLedgerEvent } from "@pshkv/core";
import { generateKeypair } from "@pshkv/gate-capability-tokens";
import { loadHumanoidWarehousePilotFixture } from "./fixture-loader.js";

type ExportRow = Record<string, unknown>;

function rowFromEvent(
  event: SintLedgerEvent,
  context: {
    readonly siteId: string;
    readonly shiftId: string;
    readonly robotId: string;
  },
): ExportRow {
  return {
    shiftId: context.shiftId,
    siteId: context.siteId,
    robotId: context.robotId,
    eventId: event.eventId,
    sequenceNumber: event.sequenceNumber.toString(),
    timestamp: event.timestamp,
    eventType: event.eventType,
    agentId: event.agentId,
    tokenId: event.tokenId,
    decision: event.payload["decision"],
    assignedTier: event.payload["assignedTier"],
    resource: event.payload["resource"],
    action: event.payload["action"],
    approvalId: event.payload["approvalId"] ?? null,
    operatorId: event.payload["operatorId"] ?? null,
    incidentId: event.payload["incidentId"] ?? null,
    handoffReceiptId: event.payload["handoffReceiptId"] ?? null,
    safetyControllerId: event.payload["safetyControllerId"] ?? null,
    latencyMs: event.payload["latencyMs"] ?? null,
    denialPolicy: event.payload["denialPolicy"] ?? null,
    rollbackTargetRef: event.payload["rollbackTargetRef"] ?? null,
    receiptRequired: event.payload["receiptRequired"],
    eventHash: event.hash,
    previousHash: event.previousHash,
  };
}

describe("Humanoid warehouse pilot fixture v1", () => {
  const fixture = loadHumanoidWarehousePilotFixture();

  it("declares a 10-50 robot warehouse/RaaS pilot scope", () => {
    expect(fixture.fixtureId).toBe("humanoid-warehouse-pilot-v1");
    expect(fixture.pilot.deploymentProfile).toBe("warehouse-amr");
    expect(fixture.pilot.targetRobotCount).toEqual({ min: 10, max: 50 });
    expect(fixture.exportSchema.format).toBe("json-lines");
    expect(fixture.successCriteria).toEqual({
      chainVerificationRequired: true,
      allT2T3HaveApprovalOrDenialEvidence: true,
      handoffRequiresReceipt: true,
      estopRequiresRollbackOrDenyEvidence: true,
      exportAcceptedByExternalReviewer: true,
    });
  });

  it("exports required per-shift audit fields from hash-chained ledger events", () => {
    const agent = generateKeypair();
    const ledger = new LedgerWriter();

    const events = fixture.sampleEvents.map((sample) =>
      ledger.append({
        eventType: sample.eventType as SintEventType,
        agentId: agent.publicKey,
        tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        payload: {
          decision: sample.decision,
          assignedTier: sample.assignedTier,
          resource: sample.resource,
          action: sample.action,
          approvalId: sample.approvalId,
          operatorId: sample.operatorId,
          incidentId: sample.incidentId,
          handoffReceiptId: sample.handoffReceiptId,
          safetyControllerId: sample.safetyControllerId,
          latencyMs: sample.latencyMs,
          denialPolicy: sample.denialPolicy,
          rollbackTargetRef: sample.rollbackTargetRef,
          receiptRequired: sample.receiptRequired,
        },
      }),
    );

    const rows = events.map((event, index) =>
      rowFromEvent(event, {
        siteId: fixture.pilot.siteId,
        shiftId: fixture.pilot.shiftId,
        robotId: fixture.sampleEvents[index]!.robotId,
      }),
    );

    expect(ledger.verifyChain().ok).toBe(true);
    for (const row of rows) {
      for (const field of fixture.exportSchema.requiredFields) {
        expect(row, field).toHaveProperty(field);
        expect(row[field], field).not.toBeUndefined();
      }
      expect(row["eventHash"]).toMatch(/^[0-9a-f]{64}$/);
      expect(row["previousHash"]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("requires T2/T3 rows to carry approval, denial, incident, or rollback evidence", () => {
    for (const sample of fixture.sampleEvents) {
      const isHighConsequence =
        sample.assignedTier === "T2_act" || sample.assignedTier === "T3_commit";
      if (!isHighConsequence) continue;

      const hasReviewEvidence =
        sample.approvalId !== undefined ||
        sample.denialPolicy !== undefined ||
        sample.incidentId !== undefined ||
        sample.rollbackTargetRef !== undefined;

      expect(hasReviewEvidence, sample.name).toBe(true);
      expect(sample.receiptRequired, sample.name).toBe(true);
    }
  });

  it("requires humanoid-to-AMR handoff rows to carry handoff receipts", () => {
    const handoff = fixture.sampleEvents.find((event) => event.name === "handoff_receipt");
    expect(handoff?.resource).toContain("/handoff");
    expect(handoff?.handoffReceiptId).toMatch(/^handoff:digit-07:amr-17:/);
    expect(handoff?.assignedTier).toBe("T2_act");
    expect(handoff?.receiptRequired).toBe(true);
  });

  it("requires e-stop evidence to include incident and rollback context", () => {
    const estop = fixture.sampleEvents.find((event) => event.name === "estop_denied");
    expect(estop?.eventType).toBe("safety.estop.triggered");
    expect(estop?.assignedTier).toBe("T3_commit");
    expect(estop?.incidentId).toBeDefined();
    expect(estop?.rollbackTargetRef).toBeDefined();
    expect(estop?.receiptRequired).toBe(true);
  });
});
