/**
 * SINT — W3C DID identity tests.
 *
 * Verifies keyToDid, didToKey, and isValidDid against known vectors.
 */

import { describe, it, expect } from "vitest";
import { generateKeypair } from "../src/crypto.js";
import { keyToDid, didToKey, isValidDid } from "../src/did.js";

describe("keyToDid / didToKey — round-trip", () => {
  it("converts an Ed25519 public key to a did:key: DID", () => {
    const { publicKey } = generateKeypair();
    const did = keyToDid(publicKey);
    expect(did).toMatch(/^did:key:z6Mk/);
  });

  it("round-trips: keyToDid → didToKey === original key", () => {
    const { publicKey } = generateKeypair();
    const did = keyToDid(publicKey);
    const recovered = didToKey(did);
    expect(recovered).toBe(publicKey);
  });

  it("round-trips for 10 independent keypairs", () => {
    for (let i = 0; i < 10; i++) {
      const { publicKey } = generateKeypair();
      const did = keyToDid(publicKey);
      expect(didToKey(did)).toBe(publicKey);
    }
  });

  it("DID starts with correct prefix did:key:z6Mk", () => {
    // All Ed25519 did:key DIDs start with z6Mk (multicodec 0xed01 encodes to 'z6Mk')
    const { publicKey } = generateKeypair();
    const did = keyToDid(publicKey);
    expect(did.startsWith("did:key:z6Mk")).toBe(true);
  });

  it("different keys produce different DIDs", () => {
    const { publicKey: key1 } = generateKeypair();
    const { publicKey: key2 } = generateKeypair();
    expect(keyToDid(key1)).not.toBe(keyToDid(key2));
  });
});

describe("isValidDid", () => {
  it("returns true for a valid did:key: with Ed25519 key", () => {
    const { publicKey } = generateKeypair();
    expect(isValidDid(keyToDid(publicKey))).toBe(true);
  });

  it("returns false for non-DID strings", () => {
    expect(isValidDid("not-a-did")).toBe(false);
    expect(isValidDid("")).toBe(false);
    expect(isValidDid("did:web:example.com")).toBe(false);
  });

  it("returns false for did:key: with wrong multicodec prefix", () => {
    // Construct a fake did:key with secp256k1 prefix (0xe701) — should be rejected
    expect(isValidDid("did:key:zQ3shwFBBmzFBQg2YVeVpDWkMRcNRJDYdAGT9FH3MJynuLt82")).toBe(false);
  });

  it("returns false for malformed base58", () => {
    expect(isValidDid("did:key:z0OIl")).toBe(false); // '0', 'O', 'I', 'l' are invalid base58
  });
});

describe("didToKey edge cases", () => {
  it("returns undefined for non-did:key: input", () => {
    expect(didToKey("did:web:example.com")).toBeUndefined();
    expect(didToKey("not-a-did")).toBeUndefined();
    expect(didToKey("")).toBeUndefined();
  });

  it("returns undefined for did:key: without 'z' multibase prefix", () => {
    expect(didToKey("did:key:ABCDEF")).toBeUndefined();
  });
});

describe("keyToDid error handling", () => {
  it("throws for a key that is not 32 bytes (too short)", () => {
    expect(() => keyToDid("deadbeef")).toThrow();
  });

  it("throws for a key that is not 32 bytes (too long)", () => {
    expect(() => keyToDid("a".repeat(68))).toThrow();
  });
});
