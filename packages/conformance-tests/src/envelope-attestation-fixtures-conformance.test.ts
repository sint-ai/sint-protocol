import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Evidence = {
  source: string;
  condition: string;
  value: boolean;
  sequence: number;
  issuedAtMs: number;
  ttlSeconds: number | "Infinity";
  scope: string;
  bootEpoch: string;
  proofStatus: "valid" | "invalid";
};

type FixtureCase = {
  id: string;
  description: string;
  nowMs: number;
  verifierState: "available" | "unavailable";
  evidence: Evidence[];
  authorizationEvidenceBinding: string;
  expected: {
    activeEnvelope: "transport" | "working";
    execution: "allow_bound_execution" | "deny_execution";
    reason: string;
  };
};

type Fixture = {
  fixtureId: string;
  schemaVersion: string;
  description: string;
  profile: {
    condition: string;
    requiredScope: string;
    trustedSources: string[];
    maxTtlSeconds: number;
    currentBootEpoch: string;
    fallbackEnvelope: "transport";
    authorizedEnvelope: "working";
    digestAlgorithm: "sha256";
    canonicalization: string;
  };
  cases: FixtureCase[];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/physical-ai");
const fixture = JSON.parse(readFileSync(
  resolve(ROOT, "envelope-attestation-fixtures.v0.1.json"),
  "utf8",
)) as Fixture;

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).sort().join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function evidenceDigest(evidence: Evidence[]): string {
  return `sha256:${createHash("sha256").update(canonical(evidence)).digest("hex")}`;
}

function evaluate(testCase: FixtureCase): FixtureCase["expected"] {
  const profile = fixture.profile;
  if (testCase.verifierState === "unavailable") {
    return { activeEnvelope: "transport", execution: "deny_execution", reason: "verifier_unavailable" };
  }

  const current = testCase.evidence.filter((entry) => {
    const ttl = entry.ttlSeconds;
    return profile.trustedSources.includes(entry.source)
      && entry.condition === profile.condition
      && entry.scope === profile.requiredScope
      && entry.bootEpoch === profile.currentBootEpoch
      && entry.proofStatus === "valid"
      && Number.isInteger(entry.sequence)
      && entry.sequence >= 0
      && Number.isFinite(entry.issuedAtMs)
      && typeof ttl === "number"
      && Number.isFinite(ttl)
      && ttl > 0
      && ttl <= profile.maxTtlSeconds
      && entry.issuedAtMs <= testCase.nowMs
      && testCase.nowMs < entry.issuedAtMs + ttl * 1000;
  });

  const latestBySource = new Map<string, Evidence>();
  for (const entry of current) {
    const prior = latestBySource.get(entry.source);
    if (!prior || entry.sequence > prior.sequence) {
      latestBySource.set(entry.source, entry);
      continue;
    }
    if (entry.sequence === prior.sequence && entry.value !== prior.value) {
      return { activeEnvelope: "transport", execution: "deny_execution", reason: "equal_sequence_conflict" };
    }
  }

  const readings = [...latestBySource.values()].map((entry) => entry.value);
  if (readings.includes(true) && readings.includes(false)) {
    return { activeEnvelope: "transport", execution: "deny_execution", reason: "trusted_source_disagreement" };
  }
  if (readings.includes(false)) {
    return { activeEnvelope: "transport", execution: "deny_execution", reason: "latest_reading_false" };
  }
  if (!readings.includes(true)) {
    return { activeEnvelope: "transport", execution: "deny_execution", reason: "no_current_verified_true" };
  }

  const actualDigest = evidenceDigest(testCase.evidence);
  const boundDigest = testCase.authorizationEvidenceBinding === "computed"
    ? actualDigest
    : testCase.authorizationEvidenceBinding;
  if (boundDigest !== actualDigest) {
    return { activeEnvelope: "working", execution: "deny_execution", reason: "authorization_evidence_mismatch" };
  }
  return { activeEnvelope: "working", execution: "allow_bound_execution", reason: "fresh_verified_true" };
}

describe("Physical Envelope Attestation Profile v0.1", () => {
  it("publishes a schema and a versioned protocol-neutral fixture", () => {
    expect(readFileSync(resolve(ROOT, "envelope-attestation-fixture.schema.json"), "utf8")).toContain(
      "physical-envelope-attestation-v0.1",
    );
    expect(fixture.fixtureId).toBe("physical-envelope-attestation-v0.1");
    expect(fixture.schemaVersion).toBe("0.1.0");
    expect(new Set(fixture.cases.map((testCase) => testCase.id)).size).toBe(fixture.cases.length);
  });

  it.each(fixture.cases)("matches evidence transition semantics: $id", (testCase) => {
    expect(evaluate(testCase)).toEqual(testCase.expected);
  });

  it("has a load-bearing positive control and exercises every agreed failure class", () => {
    expect(fixture.cases.some((testCase) => testCase.expected.execution === "allow_bound_execution")).toBe(true);
    expect(fixture.cases.some((testCase) => testCase.expected.activeEnvelope === "transport")).toBe(true);
    expect(fixture.cases.map((testCase) => testCase.id)).toEqual(expect.arrayContaining([
      "newer_false_retracts_true",
      "newer_false_retracts_true_reversed_input",
      "expired_true_demotes",
      "junk_proof_demotes",
      "verifier_outage_demotes",
      "infinite_ttl_rejected",
      "equal_sequence_conflict_demotes",
      "trusted_source_disagreement_demotes",
      "restart_replay_wrong_boot_epoch",
      "exact_evidence_binding_mismatch",
    ]));
  });
});
