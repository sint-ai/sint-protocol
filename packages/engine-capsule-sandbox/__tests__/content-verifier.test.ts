/**
 * SINT Protocol — Content verifier unit tests.
 *
 * Tests SHA-256 hash verification for capsule content.
 */

import { describe, it, expect } from "vitest";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { verifyContentHash } from "../src/content-verifier.js";

describe("verifyContentHash", () => {
  it("verifies matching hash", () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const expectedHash = bytesToHex(sha256(content));

    const result = verifyContentHash(content, expectedHash);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
  });

  it("rejects mismatched hash", () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const wrongHash = "b".repeat(64);

    const result = verifyContentHash(content, wrongHash);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("HASH_MISMATCH");
      expect(result.error.message).toContain("mismatch");
    }
  });

  it("handles empty content correctly", () => {
    const content = new Uint8Array([]);
    const expectedHash = bytesToHex(sha256(content));

    const result = verifyContentHash(content, expectedHash);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
  });

  it("handles large content buffer", () => {
    // 1 MiB of data
    const content = new Uint8Array(1024 * 1024);
    for (let i = 0; i < content.length; i++) {
      content[i] = i % 256;
    }
    const expectedHash = bytesToHex(sha256(content));

    const result = verifyContentHash(content, expectedHash);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
  });
});
