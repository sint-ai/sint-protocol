/**
 * SINT Protocol — Utility functions for capability tokens.
 *
 * @module @sint/gate-capability-tokens/utils
 */

import type { ISO8601, UUIDv7 } from "@sint-ai/core";
import { randomBytes } from "node:crypto";

/**
 * Generate a UUID v7 (time-ordered).
 *
 * UUID v7 encodes the current timestamp in the most significant bits,
 * ensuring tokens are sortable by creation time. This is important
 * for the Evidence Ledger's monotonic sequence number requirement.
 *
 * @example
 * ```ts
 * const id = generateUUIDv7(); // "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7"
 * ```
 */
export function generateUUIDv7(): UUIDv7 {
  const timestamp = Date.now();

  // 48-bit timestamp
  const timestampBytes = new Uint8Array(6);
  let ts = timestamp;
  for (let i = 5; i >= 0; i--) {
    timestampBytes[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }

  // 10 random bytes
  const rand = randomBytes(10);

  // Assemble UUID v7: timestamp (48 bits) + version (4 bits) + random (12 bits) + variant (2 bits) + random (62 bits)
  const bytes = new Uint8Array(16);
  bytes.set(timestampBytes, 0);
  bytes.set(rand, 6);

  // Set version to 7 (bits 48-51)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;

  // Set variant to 10xx (bits 64-65)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  // Format as UUID string
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as UUIDv7;
}

/**
 * Get current time as ISO 8601 string with microsecond precision in UTC.
 *
 * @example
 * ```ts
 * const now = nowISO8601(); // "2026-03-16T10:00:00.000000Z"
 * ```
 */
export function nowISO8601(): ISO8601 {
  const now = new Date();
  // JavaScript Date only supports millisecond precision,
  // so we pad with zeros for microsecond format
  const ms = now.toISOString(); // "2026-03-16T10:00:00.000Z"
  // Replace ".000Z" with ".000000Z" for microsecond format
  return ms.replace(/\.(\d{3})Z$/, ".$1000Z");
}
