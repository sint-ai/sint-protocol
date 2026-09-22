/**
 * EvidenceGatedEnvelopePlugin — unit tests for the reference selector.
 * The end-to-end adversarial matrix lives in
 * packages/conformance-tests/src/envelope-attestation-adversarial-conformance.test.ts.
 */

import { describe, it, expect } from "vitest";
import { generateKeypair } from "@pshkv/gate-capability-tokens";
import {
  Ed25519ConditionEvidenceVerifier,
  EvidenceGatedEnvelopePlugin,
  InMemoryEvidenceSequenceStore,
  signConditionEvidence,
  type ConditionEvidenceBody,
  type EvidenceGatedEnvelopeConfig,
} from "../src/evidence-gated-envelope.js";

const plc = generateKeypair();
const EPOCH = Date.parse("2026-09-22T00:00:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function body(overrides: Partial<ConditionEvidenceBody> = {}): ConditionEvidenceBody {
  return {
    evidenceId: "ev-1",
    sourceId: "plc-a",
    condition: "fence_closed",
    value: true,
    sequence: 1,
    issuedAt: iso(EPOCH),
    ttlMs: 5_000,
    ...overrides,
  };
}

function makePlugin(overrides: Partial<EvidenceGatedEnvelopeConfig> = {}, nowRef = { ms: EPOCH }) {
  return new EvidenceGatedEnvelopePlugin({
    baseline: { envelopeId: "slow", limits: { maxVelocityMps: 0.25 } },
    permissive: {
      envelopeId: "fast",
      limits: { maxVelocityMps: 1.5 },
      requires: [{ condition: "fence_closed", value: true }],
    },
    trustedSources: { "plc-a": plc.publicKey },
    verifier: new Ed25519ConditionEvidenceVerifier(),
    sequenceStore: new InMemoryEvidenceSequenceStore(),
    maxTtlMs: 10_000,
    now: () => nowRef.ms,
    ...overrides,
  });
}

describe("EvidenceGatedEnvelopePlugin", () => {
  it("refuses to construct without an injected verifier or store", () => {
    expect(() => makePlugin({ verifier: undefined as never })).toThrow(/verifier/);
    expect(() => makePlugin({ sequenceStore: undefined as never })).toThrow(/sequence store/);
  });

  it("starts in the baseline and reports unmet requirements", async () => {
    const plugin = makePlugin();
    const snap = plugin.activeEnvelope();
    expect(snap.envelopeId).toBe("slow");
    expect(snap.unmet).toHaveLength(1);
    const env = await plugin.computeEnvelope({} as never);
    expect(env.maxVelocityMps).toBe(0.25);
    expect(env.envelopeId).toBe("slow");
    expect(env.evidenceRefs).toEqual([]);
  });

  it("activates the permissive envelope on valid signed evidence and binds the evidence id", async () => {
    const plugin = makePlugin();
    const res = await plugin.ingest(signConditionEvidence(body(), plc.privateKey, plc.publicKey));
    expect(res.ok).toBe(true);
    const env = await plugin.computeEnvelope({} as never);
    expect(env.envelopeId).toBe("fast");
    expect(env.maxVelocityMps).toBe(1.5);
    expect(env.evidenceRefs).toEqual(["ev-1"]);
    expect(env.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a non-empty opaque proof (no verifier-recognised scheme)", async () => {
    const plugin = makePlugin();
    const res = await plugin.ingest({ ...body(), proof: { type: "opaque", signature: "sig" } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PROOF_INVALID");
    expect(plugin.activeEnvelope().envelopeId).toBe("slow");
  });

  it("rejects an infinite TTL", async () => {
    const plugin = makePlugin();
    // Infinity is not canonical-JSON representable, so it can never be signed;
    // an unbounded TTL can only arrive as a post-signature mutation.
    const signed = signConditionEvidence(body({ ttlMs: 1 }), plc.privateKey, plc.publicKey);
    const res = await plugin.ingest({ ...signed, ttlMs: Number.POSITIVE_INFINITY });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("TTL_INVALID");
  });

  it("a newer FALSE retracts an earlier TRUE regardless of arrival order", async () => {
    const plugin = makePlugin();
    const t = signConditionEvidence(body({ evidenceId: "t", sequence: 1 }), plc.privateKey, plc.publicKey);
    const f = signConditionEvidence(body({ evidenceId: "f", sequence: 2, value: false }), plc.privateKey, plc.publicKey);
    expect((await plugin.ingest(f)).ok).toBe(true);
    const late = await plugin.ingest(t);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe("SEQUENCE_REPLAYED");
    expect(plugin.activeEnvelope().envelopeId).toBe("slow");
  });

  it("same-sequence conflict drops the reading; a strictly newer reading restores it", async () => {
    const plugin = makePlugin();
    const a = signConditionEvidence(body({ evidenceId: "a", sequence: 3 }), plc.privateKey, plc.publicKey);
    const b = signConditionEvidence(body({ evidenceId: "b", sequence: 3 }), plc.privateKey, plc.publicKey);
    const c = signConditionEvidence(body({ evidenceId: "c", sequence: 4 }), plc.privateKey, plc.publicKey);
    expect((await plugin.ingest(a)).ok).toBe(true);
    expect(plugin.activeEnvelope().envelopeId).toBe("fast");
    const conflict = await plugin.ingest(b);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe("SEQUENCE_CONFLICT");
    expect(plugin.activeEnvelope().envelopeId).toBe("slow");
    expect((await plugin.ingest(c)).ok).toBe(true);
    expect(plugin.activeEnvelope().evidenceRefs).toEqual(["c"]);
  });

  it("expiry is evaluated at decision time with the injected clock", async () => {
    const nowRef = { ms: EPOCH };
    const plugin = makePlugin({}, nowRef);
    expect((await plugin.ingest(signConditionEvidence(body(), plc.privateKey, plc.publicKey))).ok).toBe(true);
    nowRef.ms = EPOCH + 4_999;
    expect(plugin.activeEnvelope().envelopeId).toBe("fast");
    nowRef.ms = EPOCH + 5_000;
    expect(plugin.activeEnvelope().envelopeId).toBe("slow");
  });

  it("verifier outage is a rejection, not a thrown error, and never activates", async () => {
    const plugin = makePlugin({
      verifier: { verify: async () => { throw new Error("hsm offline"); } },
    });
    const res = await plugin.ingest(signConditionEvidence(body(), plc.privateKey, plc.publicKey));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VERIFIER_UNAVAILABLE");
    expect(plugin.activeEnvelope().envelopeId).toBe("slow");
  });

  it("evidence issued before boot is rejected even with a fresh (non-durable) store", async () => {
    const nowRef = { ms: EPOCH + 60_000 };
    const plugin = makePlugin({}, nowRef);
    const old = signConditionEvidence(body({ issuedAt: iso(EPOCH + 58_000), ttlMs: 5_000 }), plc.privateKey, plc.publicKey);
    const res = await plugin.ingest(old);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("EVIDENCE_PREDATES_BOOT");
  });

  it("durable store survives a restart and rejects replay of committed evidence", async () => {
    const store = new InMemoryEvidenceSequenceStore();
    const nowRef = { ms: EPOCH };
    const first = makePlugin({ sequenceStore: store }, nowRef);
    const ev = signConditionEvidence(body({ sequence: 7 }), plc.privateKey, plc.publicKey);
    expect((await first.ingest(ev)).ok).toBe(true);
    // Restart within clock skew so the boot guard does not mask the store check.
    const second = makePlugin({ sequenceStore: store }, nowRef);
    expect(second.activeEnvelope().envelopeId).toBe("slow");
    const replay = await second.ingest(ev);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.error.code).toBe("SEQUENCE_REPLAYED");
  });
});
