import { describe, expect, it } from "vitest";
import {
  vlaActionChunkEnvelopeSchema,
  vlaMemoryEvidenceRefSchema,
} from "../src/index.js";

const digest = (character: string): string => character.repeat(64);

describe("VLA governance schemas", () => {
  it("accepts a dimensioned, deadline-bound action chunk", () => {
    const parsed = vlaActionChunkEnvelopeSchema.safeParse({
      chunkId: "019fdd12-cc01-70d4-8174-208d070bbacc",
      streamId: "arm-1",
      sequence: 0,
      issuedAt: "2026-08-07T15:59:59.000Z",
      executeBy: "2026-08-07T16:00:00.000Z",
      horizonMs: 1_000,
      controlHz: 50,
      actionCount: 50,
      actionSpaceDigest: digest("a"),
      embodimentId: "ur5e-bimanual-v1",
      worldSnapshotDigest: digest("b"),
      safeStopOnFailure: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects inconsistent action rates and non-safe-stop chunks", () => {
    const parsed = vlaActionChunkEnvelopeSchema.safeParse({
      chunkId: "019fdd12-cc01-70d4-8174-208d070bbacc",
      streamId: "arm-1",
      sequence: 0,
      issuedAt: "2026-08-07T15:59:59.000Z",
      executeBy: "2026-08-07T16:00:00.000Z",
      horizonMs: 1_000,
      controlHz: 50,
      actionCount: 10,
      actionSpaceDigest: digest("a"),
      embodimentId: "ur5e-bimanual-v1",
      worldSnapshotDigest: digest("b"),
      safeStopOnFailure: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires textual memory abstractions to reference raw evidence", () => {
    const parsed = vlaMemoryEvidenceRefSchema.safeParse({
      evidenceDigest: digest("a"),
      modality: "text-summary",
      sourceId: "memory-model",
      writerId: "policy-1",
      observedFrom: "2026-08-07T15:00:00.000Z",
      observedUntil: "2026-08-07T15:01:00.000Z",
      worldStateEpoch: "epoch-1",
      expiresAt: "2026-08-07T16:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });
});
