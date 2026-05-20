/**
 * Regulated consent extension conformance.
 *
 * H6 stays deliberately experimental: it proves consent evidence can be
 * token-bound, revocable, and privacy-preserving without storing raw media or
 * biometric templates.
 */

import { describe, expect, it } from "vitest";
import { loadRegulatedConsentExtensionsFixture } from "./fixture-loader.js";

describe("Regulated consent extensions fixture v1", () => {
  const fixture = loadRegulatedConsentExtensionsFixture();

  it("declares experimental regulated-domain boundaries", () => {
    expect(fixture.fixtureId).toBe("regulated-consent-extensions-v1");
    expect(fixture.status).toBe("experimental");
    expect(fixture.scopeNote).toContain("not HIPAA");
    expect(fixture.successCriteria.regulatedDomainClaimsRequirePartnerValidation).toBe(true);
  });

  it("defines a multimodal consent event schema with minimized evidence", () => {
    expect(fixture.consentEventSchema.requiredFields).toEqual(
      expect.arrayContaining([
        "consentId",
        "grantorRef",
        "scope",
        "tokenId",
        "resource",
        "action",
        "modalities",
        "evidenceDigest",
        "rawEvidenceStored",
        "expiresAt",
        "revocable",
      ]),
    );
    expect(fixture.consentEventSchema.allowedModalities).toEqual(
      expect.arrayContaining(["voice", "gesture", "touch", "app", "caregiver_delegation"]),
    );
    expect(fixture.consentEventSchema.privacyRules).toEqual(
      expect.objectContaining({
        rawAudioStored: false,
        rawVideoStored: false,
        biometricTemplateStored: false,
        digestAlgorithm: "sha-256",
        minimizeGrantorRef: true,
      }),
    );
  });

  it("keeps consent scopes token-bound, time-bounded, and revocable", () => {
    for (const scope of fixture.consentScopes) {
      expect(scope.grantorRef, scope.scopeId).toMatch(/^did:example:/);
      expect(scope.resourcePattern.length, scope.scopeId).toBeGreaterThan(0);
      expect(scope.actions.length, scope.scopeId).toBeGreaterThan(0);
      expect(scope.maxAgeSeconds, scope.scopeId).toBeGreaterThan(0);
      expect(scope.revocable, scope.scopeId).toBe(true);
    }

    for (const event of fixture.sampleEvents) {
      expect(event.tokenId, event.name).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(event.evidenceDigest, event.name).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(event.rawEvidenceStored, event.name).toBe(false);
      expect(event.revocable, event.name).toBe(true);
      expect(event.modalities.length, event.name).toBeGreaterThan(0);
    }
  });

  it("denies actions after consent revocation", () => {
    const revoked = fixture.sampleEvents.find((event) => event.revokedAt !== undefined);
    expect(revoked?.expectedDecision).toBe("deny");
    expect(revoked?.policyViolated).toBe("CONSENT_REVOKED");
    expect(Date.parse(revoked!.revokedAt!)).toBeLessThan(Date.parse(revoked!.expiresAt));
  });

  it("forbids raw camera, microphone, and biometric evidence in audit rows", () => {
    for (const rule of fixture.privacyPreservingEvidenceRules) {
      expect(rule.allowedEvidence.length, rule.sensor).toBeGreaterThan(0);
      expect(rule.forbiddenEvidence.length, rule.sensor).toBeGreaterThan(0);
      expect(rule.forbiddenEvidence, rule.sensor).not.toContain("eventHash");
    }

    const allForbidden = fixture.privacyPreservingEvidenceRules.flatMap(
      (rule) => rule.forbiddenEvidence,
    );
    expect(allForbidden).toEqual(
      expect.arrayContaining([
        "raw_frame",
        "face_embedding",
        "raw_audio",
        "voiceprint_embedding",
        "biometric_template",
        "remote_identification_result",
      ]),
    );
  });

  it("marks home and medical incident export prototypes as experimental", () => {
    expect(fixture.incidentExportPrototypes.map((report) => report.domain)).toEqual([
      "home",
      "medical",
    ]);

    for (const report of fixture.incidentExportPrototypes) {
      expect(report.experimental, report.name).toBe(true);
      expect(report.requiredFields, report.name).toEqual(
        expect.arrayContaining(["incidentId", "consentId", "tokenId", "evidenceDigest"]),
      );
    }
  });
});
