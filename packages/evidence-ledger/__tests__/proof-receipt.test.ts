/**
 * SINT Protocol — Proof Receipt unit tests.
 *
 * Tests cryptographic attestation generation and verification.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LedgerWriter } from "../src/writer.js";
import { generateProofReceipt, verifyProofReceipt } from "../src/proof-receipt.js";
import { generateKeypair, sign, verify } from "@pshkv/gate-capability-tokens";

describe("generateProofReceipt", () => {
  const authority = generateKeypair();
  let writer: LedgerWriter;

  beforeEach(() => {
    writer = new LedgerWriter();
  });

  it("receipt has correct eventId and eventHash", () => {
    const event = writer.append({
      eventType: "policy.evaluated",
      agentId: "a".repeat(64),
      payload: { decision: "allow" },
    });

    const receipt = generateProofReceipt(
      event,
      writer.getAll(),
      authority.publicKey,
      (data) => sign(authority.privateKey, data),
    );

    expect(receipt.eventId).toBe(event.eventId);
    expect(receipt.eventHash).toBe(event.hash);
  });

  it("hashChain contains hashes of all chain events", () => {
    const agentId = "a".repeat(64);
    writer.append({ eventType: "agent.registered", agentId, payload: {} });
    writer.append({ eventType: "policy.evaluated", agentId, payload: {} });
    const target = writer.append({ eventType: "action.completed", agentId, payload: {} });

    const allEvents = writer.getAll();
    const receipt = generateProofReceipt(
      target,
      allEvents,
      authority.publicKey,
      (data) => sign(authority.privateKey, data),
    );

    expect(receipt.hashChain.length).toBe(3);
    expect(receipt.hashChain[0]).toBe(allEvents[0]!.hash);
    expect(receipt.hashChain[1]).toBe(allEvents[1]!.hash);
    expect(receipt.hashChain[2]).toBe(allEvents[2]!.hash);
  });

  it("receipt signature is valid", () => {
    const event = writer.append({
      eventType: "policy.evaluated",
      agentId: "a".repeat(64),
      payload: {},
    });

    const receipt = generateProofReceipt(
      event,
      writer.getAll(),
      authority.publicKey,
      (data) => sign(authority.privateKey, data),
    );

    // Verify the signature over the receipt data
    const receiptData = JSON.stringify({
      eventId: receipt.eventId,
      eventHash: receipt.eventHash,
      hashChain: receipt.hashChain,
      generatedAt: receipt.generatedAt,
    });

    const isValid = verify(authority.publicKey, receipt.signature, receiptData);
    expect(isValid).toBe(true);
  });
});

describe("verifyProofReceipt", () => {
  const authority = generateKeypair();

  it("returns true for valid receipt", () => {
    const writer = new LedgerWriter();
    const event = writer.append({
      eventType: "policy.evaluated",
      agentId: "a".repeat(64),
      payload: {},
    });

    const receipt = generateProofReceipt(
      event,
      writer.getAll(),
      authority.publicKey,
      (data) => sign(authority.privateKey, data),
    );

    const isValid = verifyProofReceipt(
      receipt,
      (pubKey, sig, data) => verify(pubKey, sig, data),
    );
    expect(isValid).toBe(true);
  });

  it("returns false for tampered receipt (modified eventHash)", () => {
    const writer = new LedgerWriter();
    const event = writer.append({
      eventType: "policy.evaluated",
      agentId: "a".repeat(64),
      payload: {},
    });

    const receipt = generateProofReceipt(
      event,
      writer.getAll(),
      authority.publicKey,
      (data) => sign(authority.privateKey, data),
    );

    // Tamper with the eventHash
    const tampered = { ...receipt, eventHash: "f".repeat(64) };

    const isValid = verifyProofReceipt(
      tampered,
      (pubKey, sig, data) => verify(pubKey, sig, data),
    );
    expect(isValid).toBe(false);
  });

  it("returns false for empty hash chain", () => {
    const writer = new LedgerWriter();
    const event = writer.append({
      eventType: "policy.evaluated",
      agentId: "a".repeat(64),
      payload: {},
    });

    const receipt = generateProofReceipt(
      event,
      writer.getAll(),
      authority.publicKey,
      (data) => sign(authority.privateKey, data),
    );

    // Remove the hash chain
    const tampered = { ...receipt, hashChain: [] as string[] };

    const isValid = verifyProofReceipt(
      tampered,
      (pubKey, sig, data) => verify(pubKey, sig, data),
    );
    expect(isValid).toBe(false);
  });
});
