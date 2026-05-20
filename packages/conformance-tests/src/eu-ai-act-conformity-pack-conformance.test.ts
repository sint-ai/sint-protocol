/**
 * EU AI Act conformity pack conformance.
 *
 * The pack intentionally generates reviewer-facing material from existing
 * fixture data. That keeps compliance claims tied to executable SINT evidence.
 */

import { describe, expect, it } from "vitest";
import {
  loadEuAiActConformityPackFixture,
  loadHumanoidWarehousePilotFixture,
} from "./fixture-loader.js";

type GeneratedExport = Record<string, unknown>;

function generateArticle13Export(): GeneratedExport {
  const pack = loadEuAiActConformityPackFixture();
  const pilot = loadHumanoidWarehousePilotFixture();

  return {
    systemName: pack.deployment.systemName,
    intendedPurpose: pack.deployment.intendedPurpose,
    operatorRole: pack.deployment.operatorRole,
    resourceCatalog: pack.article13TransparencyExport.resourceCatalog,
    approvalTierModel: "T0 observe, T1 prepare, T2 act, T3 commit",
    knownLimitations: pack.article13TransparencyExport.knownLimitations,
    humanOversightMeasures: pack.article14HumanOversightExport.interventionPoints,
    logAccessProcedure: pack.article13TransparencyExport.logAccessProcedure,
    evidenceRefs: pilot.sampleEvents.map((event) => ({
      eventName: event.name,
      eventType: event.eventType,
      resource: event.resource,
      tier: event.assignedTier,
      decision: event.decision,
    })),
  };
}

function generateArticle14Export(): GeneratedExport {
  const pack = loadEuAiActConformityPackFixture();
  const pilot = loadHumanoidWarehousePilotFixture();
  const reviewRows = pilot.sampleEvents.filter(
    (event) => event.assignedTier === "T2_act" || event.assignedTier === "T3_commit",
  );

  return {
    oversightRole: pack.article14HumanOversightExport.oversightRole,
    interventionPoints: pack.article14HumanOversightExport.interventionPoints,
    stopControl: pack.article14HumanOversightExport.stopControl,
    t2T3ReviewEvidence: reviewRows.map((event) => ({
      eventName: event.name,
      approvalId: event.approvalId ?? null,
      operatorId: event.operatorId ?? null,
      incidentId: event.incidentId ?? null,
      denialPolicy: event.denialPolicy ?? null,
      rollbackTargetRef: event.rollbackTargetRef ?? null,
      receiptRequired: event.receiptRequired,
    })),
    operatorTrainingEvidence: pack.article14HumanOversightExport.operatorTrainingEvidence,
    postIncidentReview: pack.article14HumanOversightExport.postIncidentReview,
  };
}

describe("EU AI Act conformity pack fixture v1", () => {
  const fixture = loadEuAiActConformityPackFixture();

  it("anchors the pack to current Regulation (EU) 2024/1689 conformity surfaces", () => {
    expect(fixture.fixtureId).toBe("eu-ai-act-conformity-pack-v1");
    expect(fixture.regulation.name).toBe("Regulation (EU) 2024/1689");
    expect(fixture.regulation.officialTextDate).toBe("2024-06-13");
    expect(fixture.regulation.references.map((ref) => ref.id)).toEqual([
      "eu-ai-act-article-13",
      "eu-ai-act-article-14",
      "eu-ai-act-annex-iv",
    ]);
    expect(fixture.regulation.scopeNote).toContain("not a legal determination");
  });

  it("generates Article 13 transparency export fields from fixture evidence", () => {
    const generated = generateArticle13Export();

    for (const field of fixture.article13TransparencyExport.requiredFields) {
      expect(generated, field).toHaveProperty(field);
      expect(generated[field], field).not.toBeUndefined();
    }

    expect(generated["resourceCatalog"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourcePattern: "humanoid://*/base/cmd_vel",
          tier: "T2_act",
        }),
        expect.objectContaining({
          resourcePattern: "humanoid://*/estop",
          tier: "T3_commit",
        }),
      ]),
    );
    expect(generated["evidenceRefs"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: "navigation_escalated", tier: "T2_act" }),
        expect.objectContaining({ eventName: "estop_denied", tier: "T3_commit" }),
      ]),
    );
  });

  it("generates Article 14 human-oversight export with T2/T3 review evidence", () => {
    const generated = generateArticle14Export();

    for (const field of fixture.article14HumanOversightExport.requiredFields) {
      expect(generated, field).toHaveProperty(field);
      expect(generated[field], field).not.toBeUndefined();
    }

    const reviewRows = generated["t2T3ReviewEvidence"] as readonly Array<Record<string, unknown>>;
    expect(reviewRows.length).toBeGreaterThan(0);
    for (const row of reviewRows) {
      const hasReviewEvidence =
        row["approvalId"] !== null ||
        row["incidentId"] !== null ||
        row["denialPolicy"] !== null ||
        row["rollbackTargetRef"] !== null;

      expect(hasReviewEvidence, String(row["eventName"])).toBe(true);
      expect(row["receiptRequired"], String(row["eventName"])).toBe(true);
    }

    expect(fixture.article14HumanOversightExport.stopControl).toEqual(
      expect.objectContaining({
        type: "unconditional-estop",
        ledgerEvent: "safety.estop.triggered",
        requiresTokenValidation: false,
      }),
    );
  });

  it("requires every Annex IV checklist item to point at SINT artifacts", () => {
    expect(fixture.annexIVChecklist.length).toBeGreaterThanOrEqual(6);
    for (const item of fixture.annexIVChecklist) {
      expect(item.id).toMatch(/^annex-iv-/);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.sintArtifactRefs.length, item.id).toBeGreaterThan(0);
      for (const artifact of item.sintArtifactRefs) {
        expect(artifact, item.id).toMatch(/^(docs|packages)\//);
      }
    }
  });

  it("includes a service-robot ISO 13482 crosswalk for physical safety review", () => {
    expect(fixture.iso13482Crosswalk.map((item) => item.topic)).toEqual(
      expect.arrayContaining([
        "protective stop",
        "speed and separation monitoring",
        "force limiting",
        "human presence near service robot",
      ]),
    );

    for (const item of fixture.iso13482Crosswalk) {
      expect(item.sintControl.length, item.topic).toBeGreaterThan(0);
      expect(item.evidenceSource.length, item.topic).toBeGreaterThan(0);
    }
  });
});
