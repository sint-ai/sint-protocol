/**
 * SINT Protocol — Evidence-gated dynamic envelope (reference selector).
 *
 * Reference implementation of the DriftCore/LifeCore-style envelope model
 * inside SINT's DynamicEnvelopePlugin contract:
 *
 * - A deployment declares a **baseline** envelope (safe fallback, always
 *   admissible) and one **permissive** envelope that may only become active
 *   while pre-authorized operating conditions are *proven*.
 * - Condition evidence (e.g. `fence_closed=true`) is accepted only after an
 *   injected cryptographic verifier authenticates it against the trusted
 *   signer registered for that source, and after freshness, TTL, ordering,
 *   replay, and conflict checks pass.
 * - The effective limit remains `min(token, envelope)` because the gateway
 *   applies this plugin's output as a tightening override only. Evidence can
 *   activate an *already-authorized* envelope; it never creates authority.
 *
 * Failure semantics (all fail-safe toward the baseline):
 * - unverifiable, untrusted, expired, future-dated, replayed, or conflicting
 *   evidence is rejected and does not change state;
 * - a newer (higher-sequence) FALSE reading retracts an earlier TRUE reading
 *   regardless of arrival order;
 * - a lower-sequence reading arriving after a higher one is a replay;
 * - the same sequence with different content is a conflict: the source's
 *   current reading is dropped until a strictly newer reading arrives;
 * - a trusted source that disagrees blocks activation (no majority voting);
 * - expiry is evaluated at decision time with the same clock — no timers, so
 *   there is no expiry race between "evidence expired" and "envelope demoted";
 * - across a restart, in-memory readings are gone (the selector boots in the
 *   baseline), evidence issued before boot is rejected, and the injected
 *   sequence store rejects replays of evidence it has already committed.
 *
 * This selector never throws from `computeEnvelope()`; any internal failure
 * yields the baseline. Gateway-level demotion when a selector *does* throw is
 * covered by `PolicyGatewayConfig.dynamicEnvelopeFailurePolicy`.
 *
 * @module @sint/gate-policy-gateway/evidence-gated-envelope
 */

import type { Result, SintRequest } from "@pshkv/core";
import { canonicalJsonStringify, err, ok } from "@pshkv/core";
import { hashSha256, sign, verify } from "@pshkv/gate-capability-tokens";
import type { DynamicEnvelopePlugin, DynamicEnvelopeResult } from "./gateway.js";

// ---------------------------------------------------------------------------
// Evidence types
// ---------------------------------------------------------------------------

/** Proof material attached to a condition-evidence item. */
export interface ConditionEvidenceProof {
  /** Proof scheme identifier. The reference verifier accepts only "ed25519". */
  readonly type: string;
  /** Hex Ed25519 public key that produced `signature`. */
  readonly signerPublicKey?: string;
  /** Hex Ed25519 signature over `conditionEvidenceSigningPayload()`. */
  readonly signature?: string;
}

/** Unsigned condition-evidence body (the signed payload). */
export interface ConditionEvidenceBody {
  /** Unique id for this evidence item. */
  readonly evidenceId: string;
  /** Attesting source (safety PLC, fence controller, supervisor). */
  readonly sourceId: string;
  /** Operating condition name, e.g. "fence_closed". */
  readonly condition: string;
  /** Observed value of the condition. */
  readonly value: boolean;
  /** Per-(source, condition) monotonic sequence number. */
  readonly sequence: number;
  /** ISO 8601 issue time. */
  readonly issuedAt: string;
  /** Finite validity window in milliseconds (must be > 0 and ≤ maxTtlMs). */
  readonly ttlMs: number;
}

/** A condition-evidence item with proof. */
export interface ConditionEvidence extends ConditionEvidenceBody {
  readonly proof: ConditionEvidenceProof;
}

/** Why an evidence item was rejected. */
export type EvidenceRejectionCode =
  | "EVIDENCE_MALFORMED"
  | "SOURCE_UNTRUSTED"
  | "PROOF_INVALID"
  | "VERIFIER_UNAVAILABLE"
  | "TTL_INVALID"
  | "EVIDENCE_EXPIRED"
  | "EVIDENCE_FROM_FUTURE"
  | "EVIDENCE_PREDATES_BOOT"
  | "SEQUENCE_REPLAYED"
  | "SEQUENCE_CONFLICT"
  | "STORE_UNAVAILABLE";

export interface EvidenceRejection {
  readonly code: EvidenceRejectionCode;
  readonly detail: string;
}

export interface EvidenceAcceptance {
  readonly evidenceId: string;
  readonly evidenceDigest: string;
}

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

/**
 * Cryptographic verifier for condition evidence.
 * There is deliberately no default: a selector without a verifier cannot be
 * constructed. `expectedSigner` is the key registered for `evidence.sourceId`.
 */
export interface ConditionEvidenceVerifier {
  verify(
    evidence: ConditionEvidence,
    expectedSigner: string,
  ): Promise<Result<true, string>>;
}

/** Canonical signing payload: the evidence body without `proof`. */
export function conditionEvidenceSigningPayload(body: ConditionEvidenceBody): string {
  return canonicalJsonStringify({
    evidenceId: body.evidenceId,
    sourceId: body.sourceId,
    condition: body.condition,
    value: body.value,
    sequence: body.sequence,
    issuedAt: body.issuedAt,
    ttlMs: body.ttlMs,
  });
}

/** Content digest of the full evidence item (body + proof). */
export function conditionEvidenceDigest(evidence: ConditionEvidence): string {
  return hashSha256(canonicalJsonStringify(evidence));
}

/** Sign an evidence body with an Ed25519 private key. Test/tooling helper. */
export function signConditionEvidence(
  body: ConditionEvidenceBody,
  privateKeyHex: string,
  signerPublicKey: string,
): ConditionEvidence {
  return {
    ...body,
    proof: {
      type: "ed25519",
      signerPublicKey,
      signature: sign(privateKeyHex, conditionEvidenceSigningPayload(body)),
    },
  };
}

/** Reference Ed25519 verifier. Rejects any other proof type. */
export class Ed25519ConditionEvidenceVerifier implements ConditionEvidenceVerifier {
  async verify(
    evidence: ConditionEvidence,
    expectedSigner: string,
  ): Promise<Result<true, string>> {
    const proof = evidence.proof;
    if (!proof || proof.type !== "ed25519") {
      return err(`unsupported proof type: ${String(proof?.type)}`);
    }
    if (!proof.signerPublicKey || !proof.signature) {
      return err("proof is missing signerPublicKey or signature");
    }
    if (proof.signerPublicKey !== expectedSigner) {
      return err("proof signer does not match the trusted key for this source");
    }
    const valid = verify(
      proof.signerPublicKey,
      proof.signature,
      conditionEvidenceSigningPayload(evidence),
    );
    return valid ? ok(true) : err("signature verification failed");
  }
}

// ---------------------------------------------------------------------------
// Sequence store (replay guard)
// ---------------------------------------------------------------------------

export interface EvidenceSequenceRecord {
  readonly sequence: number;
  readonly evidenceDigest: string;
}

/** Durable tombstone for a sequence at which authenticated payloads conflicted. */
export const CONFLICTED_EVIDENCE_DIGEST = "conflicted";

/**
 * Durable per-(source, condition) high-water mark.
 * Production deployments must back this with persistent storage so that a
 * restart cannot be used to replay previously accepted evidence.
 */
export interface EvidenceSequenceStore {
  get(sourceId: string, condition: string): Promise<EvidenceSequenceRecord | undefined>;
  /**
   * Atomically replace `expected` with `record`. Implementations MUST reject a
   * lower sequence and MUST NOT replace a conflict tombstone at the same
   * sequence. Returning false means the precondition or monotonicity rule did
   * not hold.
   */
  compareAndSet(
    sourceId: string,
    condition: string,
    expected: EvidenceSequenceRecord | undefined,
    record: EvidenceSequenceRecord,
  ): Promise<boolean>;
}

/** Non-durable store for tests and prototypes. State is lost on restart. */
export class InMemoryEvidenceSequenceStore implements EvidenceSequenceStore {
  private readonly records = new Map<string, EvidenceSequenceRecord>();

  async get(sourceId: string, condition: string): Promise<EvidenceSequenceRecord | undefined> {
    return this.records.get(`${sourceId}\u0000${condition}`);
  }

  async compareAndSet(
    sourceId: string,
    condition: string,
    expected: EvidenceSequenceRecord | undefined,
    record: EvidenceSequenceRecord,
  ): Promise<boolean> {
    const key = `${sourceId}\u0000${condition}`;
    const current = this.records.get(key);
    if (
      current?.sequence !== expected?.sequence
      || current?.evidenceDigest !== expected?.evidenceDigest
    ) {
      return false;
    }
    if (current && record.sequence < current.sequence) return false;
    if (
      current
      && record.sequence === current.sequence
      && current.evidenceDigest !== record.evidenceDigest
      && record.evidenceDigest !== CONFLICTED_EVIDENCE_DIGEST
    ) {
      return false;
    }
    if (
      current?.evidenceDigest === CONFLICTED_EVIDENCE_DIGEST
      && record.sequence === current.sequence
      && record.evidenceDigest !== CONFLICTED_EVIDENCE_DIGEST
    ) {
      return false;
    }
    this.records.set(key, record);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Envelope configuration
// ---------------------------------------------------------------------------

export interface EnvelopeLimits {
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
}

export interface ConditionRequirement {
  readonly condition: string;
  readonly value: boolean;
  /** Minimum number of agreeing trusted sources (default 1). */
  readonly minSources?: number;
}

export interface BaselineEnvelopeSpec {
  readonly envelopeId?: string;
  readonly limits: EnvelopeLimits;
}

export interface PermissiveEnvelopeSpec {
  readonly envelopeId: string;
  readonly limits: EnvelopeLimits;
  readonly requires: readonly ConditionRequirement[];
}

export interface EvidenceGatedEnvelopeConfig {
  /** Safe fallback. Active whenever the permissive envelope is not proven. */
  readonly baseline: BaselineEnvelopeSpec;
  /** Envelope that activates only while every requirement is proven. */
  readonly permissive: PermissiveEnvelopeSpec;
  /** sourceId → hex Ed25519 public key allowed to attest for that source. */
  readonly trustedSources: Readonly<Record<string, string>>;
  /** Injected cryptographic verifier (required; no default). */
  readonly verifier: ConditionEvidenceVerifier;
  /** Injected replay guard (required; use a durable implementation in production). */
  readonly sequenceStore: EvidenceSequenceStore;
  /** Upper bound on evidence TTL (default 30 s). Infinite TTLs are rejected. */
  readonly maxTtlMs?: number;
  /** Tolerated clock skew for future-dated evidence (default 1 s). */
  readonly maxClockSkewMs?: number;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  readonly now?: () => number;
}

export interface ActiveEnvelopeSnapshot {
  readonly envelopeId: string;
  readonly limits: EnvelopeLimits;
  /** Evidence ids relied on for this selection (empty for the baseline). */
  readonly evidenceRefs: readonly string[];
  /** SHA-256 over the relied-on evidence set (stable, order-independent). */
  readonly evidenceDigest: string;
  /** Unmet requirements when the baseline is active. */
  readonly unmet: readonly string[];
}

interface Reading {
  readonly evidenceId: string;
  readonly evidenceDigest: string;
  readonly value: boolean;
  readonly sequence: number;
  readonly expiresAtMs: number;
}

const DEFAULT_MAX_TTL_MS = 30_000;
const DEFAULT_MAX_CLOCK_SKEW_MS = 1_000;
const DEFAULT_BASELINE_ID = "baseline";
const MAX_CAS_ATTEMPTS = 8;

function parseIsoMs(value: string): number | undefined {
  if (typeof value !== "string") return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

export class EvidenceGatedEnvelopePlugin implements DynamicEnvelopePlugin {
  private readonly config: EvidenceGatedEnvelopeConfig;
  private readonly readings = new Map<string, Map<string, Reading>>();
  private readonly maxTtlMs: number;
  private readonly maxClockSkewMs: number;
  private readonly now: () => number;
  private readonly bootedAtMs: number;

  constructor(config: EvidenceGatedEnvelopeConfig) {
    if (!config.verifier) {
      throw new Error("EvidenceGatedEnvelopePlugin requires an injected verifier");
    }
    if (!config.sequenceStore) {
      throw new Error("EvidenceGatedEnvelopePlugin requires an injected sequence store");
    }
    if (config.permissive.requires.length === 0) {
      throw new Error("permissive envelope must declare at least one condition requirement");
    }
    // Verification is a boundary. Keep an immutable snapshot rather than live
    // references that a caller could widen after construction.
    this.config = Object.freeze({
      ...config,
      baseline: Object.freeze({
        ...config.baseline,
        limits: Object.freeze({ ...config.baseline.limits }),
      }),
      permissive: Object.freeze({
        ...config.permissive,
        limits: Object.freeze({ ...config.permissive.limits }),
        requires: Object.freeze(config.permissive.requires.map((requirement) =>
          Object.freeze({ ...requirement }))),
      }),
      trustedSources: Object.freeze({ ...config.trustedSources }),
    });
    this.maxTtlMs = config.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
    this.maxClockSkewMs = config.maxClockSkewMs ?? DEFAULT_MAX_CLOCK_SKEW_MS;
    this.now = config.now ?? (() => Date.now());
    this.bootedAtMs = this.now();
  }

  /**
   * Ingest one condition-evidence item. Rejections never mutate state, with
   * one deliberate exception: a same-sequence conflict drops the source's
   * current reading for that condition (fail-safe toward the baseline).
   */
  async ingest(evidence: ConditionEvidence): Promise<Result<EvidenceAcceptance, EvidenceRejection>> {
    // 1. Structure
    if (
      !evidence ||
      typeof evidence.evidenceId !== "string" || evidence.evidenceId.length === 0 ||
      typeof evidence.sourceId !== "string" || evidence.sourceId.length === 0 ||
      typeof evidence.condition !== "string" || evidence.condition.length === 0 ||
      typeof evidence.value !== "boolean" ||
      typeof evidence.sequence !== "number" || !Number.isSafeInteger(evidence.sequence) || evidence.sequence < 0 ||
      typeof evidence.proof !== "object" || evidence.proof === null
    ) {
      return err({ code: "EVIDENCE_MALFORMED", detail: "evidence is missing required fields" });
    }
    if (typeof evidence.ttlMs !== "number" || !Number.isFinite(evidence.ttlMs) || evidence.ttlMs <= 0) {
      return err({ code: "TTL_INVALID", detail: "ttlMs must be a finite positive number" });
    }
    if (evidence.ttlMs > this.maxTtlMs) {
      return err({ code: "TTL_INVALID", detail: `ttlMs ${evidence.ttlMs} exceeds maxTtlMs ${this.maxTtlMs}` });
    }
    const issuedAtMs = parseIsoMs(evidence.issuedAt);
    if (issuedAtMs === undefined) {
      return err({ code: "EVIDENCE_MALFORMED", detail: "issuedAt is not a valid ISO 8601 timestamp" });
    }

    // 2. Source trust
    const expectedSigner = this.config.trustedSources[evidence.sourceId];
    if (!expectedSigner) {
      return err({ code: "SOURCE_UNTRUSTED", detail: `source ${evidence.sourceId} is not registered` });
    }

    // 3. Cryptographic verification (verifier outage is a rejection, not an error)
    let verified: Result<true, string>;
    try {
      verified = await this.config.verifier.verify(evidence, expectedSigner);
    } catch (cause) {
      return err({
        code: "VERIFIER_UNAVAILABLE",
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    if (!verified || verified.ok !== true || verified.value !== true) {
      if (!verified || typeof verified !== "object" || verified.ok !== false) {
        return err({
          code: "VERIFIER_UNAVAILABLE",
          detail: "verifier returned a result other than explicit success true",
        });
      }
      return err({ code: "PROOF_INVALID", detail: verified.error });
    }

    // 4. Freshness
    const nowMs = this.now();
    if (issuedAtMs > nowMs + this.maxClockSkewMs) {
      return err({ code: "EVIDENCE_FROM_FUTURE", detail: "issuedAt is ahead of the selector clock" });
    }
    const expiresAtMs = issuedAtMs + evidence.ttlMs;
    if (expiresAtMs <= nowMs) {
      return err({ code: "EVIDENCE_EXPIRED", detail: "evidence expired before ingestion" });
    }

    // 5. Ordering / replay / conflict against the durable high-water mark.
    // Every state transition is a compare-and-set so two authorities sharing
    // a store cannot overwrite newer safety information with an older read.
    const evidenceDigest = conditionEvidenceDigest(evidence);
    // 6. Restart replay guard independent of store durability.
    if (issuedAtMs < this.bootedAtMs - this.maxClockSkewMs) {
      return err({ code: "EVIDENCE_PREDATES_BOOT", detail: "evidence was issued before this selector booted" });
    }

    // 7. Commit to the store *before* updating in-memory state.
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      let record: EvidenceSequenceRecord | undefined;
      try {
        record = await this.config.sequenceStore.get(evidence.sourceId, evidence.condition);
      } catch (cause) {
        return err({
          code: "STORE_UNAVAILABLE",
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }

      if (record) {
        if (evidence.sequence < record.sequence) {
          return err({ code: "SEQUENCE_REPLAYED", detail: `sequence ${evidence.sequence} < ${record.sequence}` });
        }
        if (evidence.sequence === record.sequence) {
          if (record.evidenceDigest === CONFLICTED_EVIDENCE_DIGEST) {
            this.readings.get(evidence.condition)?.delete(evidence.sourceId);
            return err({
              code: "SEQUENCE_CONFLICT",
              detail: "sequence is durably conflicted; recovery requires a strictly newer reading",
            });
          }
          if (evidenceDigest === record.evidenceDigest) {
            return err({ code: "SEQUENCE_REPLAYED", detail: "duplicate of already-accepted evidence" });
          }
          try {
            const poisoned = await this.config.sequenceStore.compareAndSet(
              evidence.sourceId,
              evidence.condition,
              record,
              { sequence: evidence.sequence, evidenceDigest: CONFLICTED_EVIDENCE_DIGEST },
            );
            if (!poisoned) continue;
          } catch (cause) {
            return err({
              code: "STORE_UNAVAILABLE",
              detail: cause instanceof Error ? cause.message : String(cause),
            });
          }
          this.readings.get(evidence.condition)?.delete(evidence.sourceId);
          return err({
            code: "SEQUENCE_CONFLICT",
            detail: "different authenticated evidence at one sequence; sequence durably poisoned",
          });
        }
      }

      try {
        const committed = await this.config.sequenceStore.compareAndSet(
          evidence.sourceId,
          evidence.condition,
          record,
          { sequence: evidence.sequence, evidenceDigest },
        );
        if (!committed) continue;
      } catch (cause) {
        return err({
          code: "STORE_UNAVAILABLE",
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }

      let bySource = this.readings.get(evidence.condition);
      if (!bySource) {
        bySource = new Map();
        this.readings.set(evidence.condition, bySource);
      }
      bySource.set(evidence.sourceId, {
        evidenceId: evidence.evidenceId,
        evidenceDigest,
        value: evidence.value,
        sequence: evidence.sequence,
        expiresAtMs,
      });
      return ok({ evidenceId: evidence.evidenceId, evidenceDigest });
    }
    return err({
      code: "STORE_UNAVAILABLE",
      detail: "sequence store changed repeatedly while committing evidence",
    });
  }

  /** Evaluate which envelope is active right now. Pure with respect to the clock. */
  activeEnvelope(): ActiveEnvelopeSnapshot {
    const nowMs = this.now();
    const unmet: string[] = [];
    const reliedOn: Array<{ evidenceId: string; evidenceDigest: string }> = [];

    for (const requirement of this.config.permissive.requires) {
      const bySource = this.readings.get(requirement.condition);
      const current: Reading[] = [];
      if (bySource) {
        for (const [sourceId, reading] of bySource) {
          if (reading.expiresAtMs <= nowMs) {
            bySource.delete(sourceId);
            continue;
          }
          current.push(reading);
        }
      }
      const disagreeing = current.filter((r) => r.value !== requirement.value);
      const agreeing = current.filter((r) => r.value === requirement.value);
      const minSources = requirement.minSources ?? 1;
      if (disagreeing.length > 0) {
        unmet.push(`${requirement.condition}: trusted source reports ${String(!requirement.value)}`);
        continue;
      }
      if (agreeing.length < minSources) {
        unmet.push(`${requirement.condition}: ${agreeing.length}/${minSources} fresh attestations`);
        continue;
      }
      for (const r of agreeing) {
        reliedOn.push({ evidenceId: r.evidenceId, evidenceDigest: r.evidenceDigest });
      }
    }

    if (unmet.length > 0) {
      return {
        envelopeId: this.config.baseline.envelopeId ?? DEFAULT_BASELINE_ID,
        limits: this.config.baseline.limits,
        evidenceRefs: [],
        evidenceDigest: hashSha256(canonicalJsonStringify([])),
        unmet,
      };
    }

    reliedOn.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0));
    return {
      envelopeId: this.config.permissive.envelopeId,
      limits: this.config.permissive.limits,
      evidenceRefs: reliedOn.map((r) => r.evidenceId),
      evidenceDigest: hashSha256(canonicalJsonStringify(reliedOn)),
      unmet: [],
    };
  }

  /** DynamicEnvelopePlugin contract. Never throws; failures yield the baseline. */
  async computeEnvelope(_request: SintRequest): Promise<DynamicEnvelopeResult> {
    let snapshot: ActiveEnvelopeSnapshot;
    try {
      snapshot = this.activeEnvelope();
    } catch {
      snapshot = {
        envelopeId: this.config.baseline.envelopeId ?? DEFAULT_BASELINE_ID,
        limits: this.config.baseline.limits,
        evidenceRefs: [],
        evidenceDigest: hashSha256(canonicalJsonStringify([])),
        unmet: ["selector error"],
      };
    }
    return {
      maxVelocityMps: snapshot.limits.maxVelocityMps,
      maxForceNewtons: snapshot.limits.maxForceNewtons,
      envelopeId: snapshot.envelopeId,
      evidenceDigest: snapshot.evidenceDigest,
      evidenceRefs: snapshot.evidenceRefs,
      reason:
        snapshot.unmet.length === 0
          ? `envelope ${snapshot.envelopeId} proven by ${snapshot.evidenceRefs.length} attestation(s)`
          : `baseline: ${snapshot.unmet.join("; ")}`,
    };
  }
}
