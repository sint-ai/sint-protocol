import { describe, expect, it } from "vitest";
import { generateKeypair, sign, verify } from "@pshkv/gate-capability-tokens";
import { LedgerWriter } from "../src/writer.js";
import {
  computeReceiptLinkageHash,
  generateBilateralProofReceiptPair,
  verifyBilateralReceiptPair,
} from "../src/proof-receipt.js";

describe("bilateral proof receipts", () => {
  const authority = generateKeypair();

  it("generates linked gate and completion receipts with a shared linkage hash", () => {
    const writer = new LedgerWriter();
    const agentId = "a".repeat(64);

    const gateEvent = writer.append({
      eventType: "policy.evaluated",
      agentId,
      payload: { action: "allow", tier: "T3_commit" },
    });
    const completionEvent = writer.append({
      eventType: "action.completed",
      agentId,
      payload: { result: "ok" },
    });

    const pair = generateBilateralProofReceiptPair({
      actionRef: "01963d6b-5000-7000-8000-000000000001",
      gateEvent,
      gateChainEvents: [gateEvent],
      completionEvent,
      completionChainEvents: writer.getAll(),
      signerPublicKey: authority.publicKey,
      signFn: (data) => sign(authority.privateKey, data),
    });

    expect(pair.gate.stage).toBe("gate");
    expect(pair.completion.stage).toBe("completion");
    expect(pair.gate.actionRef).toBe(pair.completion.actionRef);
    expect(pair.gate.linkageHash).toBe(pair.completion.linkageHash);
    expect(pair.gate.counterpartEventId).toBe(completionEvent.eventId);
    expect(pair.completion.counterpartEventId).toBe(gateEvent.eventId);
  });

  it("verifies a valid bilateral receipt pair", () => {
    const writer = new LedgerWriter();
    const agentId = "b".repeat(64);

    const gateEvent = writer.append({
      eventType: "policy.evaluated",
      agentId,
      payload: { action: "allow" },
    });
    const completionEvent = writer.append({
      eventType: "action.failed",
      agentId,
      payload: { reason: "device timeout" },
    });

    const pair = generateBilateralProofReceiptPair({
      actionRef: "01963d6b-5000-7000-8000-000000000002",
      gateEvent,
      gateChainEvents: [gateEvent],
      completionEvent,
      completionChainEvents: writer.getAll(),
      completionOutcome: "failed",
      signerPublicKey: authority.publicKey,
      signFn: (data) => sign(authority.privateKey, data),
    });

    expect(
      verifyBilateralReceiptPair(pair, (pubKey, signature, data) =>
        verify(pubKey, signature, data),
      ),
    ).toBe(true);
  });

  it("fails verification when the pair linkage is tampered", () => {
    const writer = new LedgerWriter();
    const agentId = "c".repeat(64);

    const gateEvent = writer.append({
      eventType: "policy.evaluated",
      agentId,
      payload: { action: "escalate" },
    });
    const completionEvent = writer.append({
      eventType: "action.rolledback",
      agentId,
      payload: { reason: "operator abort" },
    });

    const pair = generateBilateralProofReceiptPair({
      actionRef: "01963d6b-5000-7000-8000-000000000003",
      gateEvent,
      gateChainEvents: [gateEvent],
      gateOutcome: "escalate",
      completionEvent,
      completionChainEvents: writer.getAll(),
      completionOutcome: "rolledback",
      signerPublicKey: authority.publicKey,
      signFn: (data) => sign(authority.privateKey, data),
    });

    const tampered = {
      gate: pair.gate,
      completion: {
        ...pair.completion,
        linkageHash: computeReceiptLinkageHash(
          pair.completion.actionRef,
          pair.completion.eventId,
          pair.gate.eventId,
        ),
      },
    };

    expect(
      verifyBilateralReceiptPair(tampered, (pubKey, signature, data) =>
        verify(pubKey, signature, data),
      ),
    ).toBe(false);
  });
});
