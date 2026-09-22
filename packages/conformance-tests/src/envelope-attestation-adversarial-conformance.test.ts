/**
 * Physical Envelope Attestation Profile v0.1 — shared adversarial fixture runner.
 *
 * Executes `fixtures/physical-ai/envelope-attestation-adversarial.v0.1.json`
 * against the SINT reference stack:
 *
 *   ConditionEvidence ──► EvidenceGatedEnvelopePlugin ──► PolicyGateway.intercept()
 *   (Ed25519 signed)      (verifier + replay store)        (min(token, envelope) + binding)
 *
 * The fixture is protocol-neutral. This file is only the SINT mapping:
 *   outcome "pass"      → decision is not a deny (T2 cmd_vel → "escalate")
 *   outcome "violation" → deny / CONSTRAINT_VIOLATION
 *   outcome "refused"   → deny / DYNAMIC_ENVELOPE_UNAVAILABLE
 *   activeEnvelope      → transformations.additionalAuditFields.envelopeBinding.envelopeId
 *   events              → policy.envelope.applied / policy.envelope.fallback
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { SintCapabilityToken, SintRequest } from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import {
  Ed25519ConditionEvidenceVerifier,
  EvidenceGatedEnvelopePlugin,
  InMemoryEvidenceSequenceStore,
  PolicyGateway,
  signConditionEvidence,
  type ConditionEvidence,
  type ConditionEvidenceBody,
  type ConditionEvidenceVerifier,
  type DynamicEnvelopePlugin,
  type EnvelopeBinding,
  type EvidenceSequenceRecord,
  type EvidenceSequenceStore,
} from "@pshkv/gate-policy-gateway";
import {
  loadEnvelopeAttestationAdversarialFixture,
  type EnvelopeAttestationCase,
  type EnvelopeAttestationDeployment,
  type EnvelopeAttestationFixture,
  type EnvelopeAttestationStep,
} from "./fixture-loader.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function isoMicro(ms: number): string {
  return new Date(ms).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function futureISO(hours: number): string {
  return isoMicro(Date.now() + hours * 3_600_000);
}

class Harness {
  readonly nowRef = { ms: 0 };
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  readonly captured = new Map<string, EnvelopeBinding>();
  readonly keys = new Map<string, { publicKey: string; privateKey: string }>();
  verifierAvailable = true;
  storeAvailable = true;
  selectorThrowing = false;
  private selector!: EvidenceGatedEnvelopePlugin;
  private store: EvidenceSequenceStore = new InMemoryEvidenceSequenceStore();
  private gateway!: PolicyGateway;
  private token!: SintCapabilityToken;
  private readonly root = generateKeypair();
  private readonly agent = generateKeypair();

  constructor(
    private readonly fixture: EnvelopeAttestationFixture,
    private readonly deployment: EnvelopeAttestationDeployment,
  ) {
    for (const label of Object.keys(fixture.signers)) {
      this.keys.set(label, generateKeypair());
    }
    this.nowRef.ms = Date.parse(fixture.clock.epoch);
    this.boot();
  }

  /** (Re)create the selector and gateway. Emulates a process restart. */
  boot(preserveStore = true): void {
    if (!preserveStore) this.store = new InMemoryEvidenceSequenceStore();
    const trustedSources: Record<string, string> = {};
    for (const [label, spec] of Object.entries(this.fixture.signers)) {
      if (spec.trusted) trustedSources[label] = this.keys.get(label)!.publicKey;
    }
    const realVerifier = new Ed25519ConditionEvidenceVerifier();
    const verifier: ConditionEvidenceVerifier = {
      verify: async (e, k) => {
        if (!this.verifierAvailable) throw new Error("verifier unreachable");
        return realVerifier.verify(e, k);
      },
    };
    const inner = this.store;
    const store: EvidenceSequenceStore = {
      get: async (s, c) => {
        if (!this.storeAvailable) throw new Error("store unreachable");
        return inner.get(s, c);
      },
      commit: async (s, c, r: EvidenceSequenceRecord) => {
        if (!this.storeAvailable) throw new Error("store unreachable");
        return inner.commit(s, c, r);
      },
    };
    this.selector = new EvidenceGatedEnvelopePlugin({
      baseline: this.deployment.baseline,
      permissive: this.deployment.permissive,
      trustedSources,
      verifier,
      sequenceStore: store,
      maxTtlMs: this.deployment.maxTtlMs,
      maxClockSkewMs: this.deployment.maxClockSkewMs,
      now: () => this.nowRef.ms,
    });
    const selectorRef: DynamicEnvelopePlugin = {
      computeEnvelope: (req) => {
        if (this.selectorThrowing) throw new Error("selector fault injected");
        return this.selector.computeEnvelope(req);
      },
    };
    const issued = issueCapabilityToken(
      {
        issuer: this.root.publicKey,
        subject: this.agent.publicKey,
        resource: this.fixture.probe.resource,
        actions: [this.fixture.probe.action],
        constraints: { ...this.deployment.authorizedLimits },
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(4),
        revocable: false,
      },
      this.root.privateKey,
    );
    if (!issued.ok) throw new Error(`token issuance failed: ${issued.error}`);
    this.token = issued.value;
    this.gateway = new PolicyGateway({
      resolveToken: () => this.token,
      dynamicEnvelope: selectorRef,
      dynamicEnvelopeFailurePolicy: this.deployment.selectorFailurePolicy,
      emitLedgerEvent: (ev) => this.events.push(ev as (typeof this.events)[number]),
    });
  }

  buildEvidence(step: Extract<EnvelopeAttestationStep, { op: "ingest" }>): ConditionEvidence {
    const epoch = Date.parse(this.fixture.clock.epoch);
    const body: ConditionEvidenceBody = {
      evidenceId: step.evidence.evidenceId,
      sourceId: step.evidence.sourceId,
      condition: step.evidence.condition,
      value: step.evidence.value,
      sequence: step.evidence.sequence,
      issuedAt: isoMicro(epoch + step.evidence.issuedAt),
      // An unbounded TTL is not representable in canonical JSON, so it cannot be
      // signed. Sign a finite placeholder and override afterwards: the structural
      // TTL check must reject it before any cryptographic work.
      ttlMs: step.evidence.ttlMs === "unbounded" ? 1 : step.evidence.ttlMs,
    };
    const signer = this.keys.get(step.signer);
    if (!signer) throw new Error(`unknown signer ${step.signer}`);
    let evidence: ConditionEvidence = signConditionEvidence(body, signer.privateKey, signer.publicKey);
    if (step.evidence.ttlMs === "unbounded") {
      evidence = { ...evidence, ttlMs: Number.POSITIVE_INFINITY };
    }
    if (step.proofOverride === "opaque-string") {
      evidence = { ...body, proof: { type: "opaque", signature: "sig" } };
    } else if (step.proofOverride === "none") {
      evidence = { ...body, proof: { type: "none" } };
    }
    if (step.tamperAfterSigning) {
      evidence = { ...evidence, ...step.tamperAfterSigning } as ConditionEvidence;
    }
    return evidence;
  }

  async ingest(evidence: ConditionEvidence) {
    return this.selector.ingest(evidence);
  }

  async probe(commandedVelocityMps: number) {
    const before = this.events.length;
    const request: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: isoMicro(this.nowRef.ms),
      agentId: this.agent.publicKey,
      tokenId: this.token.tokenId,
      resource: this.fixture.probe.resource,
      action: this.fixture.probe.action,
      params: {},
      physicalContext: { currentVelocityMps: commandedVelocityMps },
    };
    const decision = await this.gateway.intercept(request);
    const emitted = this.events.slice(before).map((e) => e.eventType);
    const binding = decision.transformations?.additionalAuditFields?.["envelopeBinding"] as
      | EnvelopeBinding
      | undefined;
    return { decision, emitted, binding };
  }
}

function mergeDeployment(
  base: EnvelopeAttestationDeployment,
  override: EnvelopeAttestationCase["deploymentOverride"],
): EnvelopeAttestationDeployment {
  return { ...base, ...(override ?? {}) };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

describe("Physical Envelope Attestation Profile v0.1 — adversarial fixture (SINT reference runner)", () => {
  let fixture: EnvelopeAttestationFixture;

  beforeAll(() => {
    fixture = loadEnvelopeAttestationAdversarialFixture();
  });

  it("covers all five DriftCore fixture requirements", () => {
    const covered = new Set(fixture.cases.map((c) => c.requirement));
    expect([...covered].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("requirement 1 is load-bearing: at least one case expects activation of the permissive envelope", () => {
    const activations = fixture.cases.flatMap((c) =>
      c.steps.filter(
        (s) => s.op === "probe" && s.expect.activeEnvelope === fixture.deployment.permissive.envelopeId && s.expect.outcome === "pass",
      ),
    );
    expect(activations.length).toBeGreaterThan(0);
  });

  const loaded = loadEnvelopeAttestationAdversarialFixture();
  for (const testCase of loaded.cases) {
    it(`[R${testCase.requirement}] ${testCase.caseId}: ${testCase.name}`, async () => {
      const deployment = mergeDeployment(loaded.deployment, testCase.deploymentOverride);
      const h = new Harness(loaded, deployment);
      const epoch = Date.parse(loaded.clock.epoch);

      for (const step of testCase.steps) {
        h.nowRef.ms = epoch + step.at;
        const where = `${testCase.caseId} @${step.at} ${step.op}`;

        switch (step.op) {
          case "ingest": {
            const result = await h.ingest(h.buildEvidence(step));
            if (step.expect.accepted) {
              expect(result.ok, `${where}: expected acceptance, got ${result.ok ? "" : JSON.stringify(result.error)}`).toBe(true);
            } else {
              expect(result.ok, `${where}: expected rejection`).toBe(false);
              if (!result.ok && step.expect.code) {
                const allowed = Array.isArray(step.expect.code) ? step.expect.code : [step.expect.code];
                expect(allowed, `${where}: code ${result.error.code}`).toContain(result.error.code);
              }
            }
            break;
          }
          case "probe": {
            const velocity = step.commandedVelocityMps ?? loaded.probe.commandedVelocityMps;
            const { decision, emitted, binding } = await h.probe(velocity);
            switch (step.expect.outcome) {
              case "pass":
                expect(decision.action, `${where}: ${JSON.stringify(decision.denial)}`).not.toBe("deny");
                expect(decision.action, where).toBe("escalate"); // ros2:///cmd_vel is T2_act
                break;
              case "violation":
                expect(decision.action, where).toBe("deny");
                expect(decision.denial?.policyViolated, where).toBe("CONSTRAINT_VIOLATION");
                break;
              case "refused":
                expect(decision.action, where).toBe("deny");
                expect(decision.denial?.policyViolated, where).toBe("DYNAMIC_ENVELOPE_UNAVAILABLE");
                break;
            }
            if (step.expect.activeEnvelope !== undefined) {
              expect(binding?.envelopeId, `${where}: activeEnvelope`).toBe(step.expect.activeEnvelope);
            }
            for (const ev of step.expect.events ?? []) {
              expect(emitted, `${where}: events`).toContain(`policy.${ev}`);
            }
            const b = step.expect.binding;
            if (b) {
              expect(binding, `${where}: binding present`).toBeDefined();
              expect(binding!.envelopeDigest, where).toMatch(/^[0-9a-f]{64}$/);
              if (b.evidenceRefs) expect([...(binding!.evidenceRefs ?? [])], where).toEqual(b.evidenceRefs);
              if (b.effectiveLimits) expect(binding!.effective, where).toEqual(b.effectiveLimits);
              if (b.captureAs) h.captured.set(b.captureAs, binding!);
              if (b.evidenceDigestEquals) {
                expect(binding!.evidenceDigest, where).toBe(h.captured.get(b.evidenceDigestEquals)!.evidenceDigest);
              }
              if (b.evidenceDigestDiffersFrom) {
                expect(binding!.evidenceDigest, where).not.toBe(h.captured.get(b.evidenceDigestDiffersFrom)!.evidenceDigest);
              }
              if (b.envelopeDigestEquals) {
                expect(binding!.envelopeDigest, where).toBe(h.captured.get(b.envelopeDigestEquals)!.envelopeDigest);
              }
              if (b.envelopeDigestDiffersFrom) {
                expect(binding!.envelopeDigest, where).not.toBe(h.captured.get(b.envelopeDigestDiffersFrom)!.envelopeDigest);
              }
            }
            break;
          }
          case "restart":
            h.boot(step.preserveSequenceStore);
            break;
          case "verifier":
            h.verifierAvailable = step.state === "available";
            break;
          case "store":
            h.storeAvailable = step.state === "available";
            break;
          case "fault":
            h.selectorThrowing = step.state === "throwing";
            break;
        }
      }
    });
  }
});
