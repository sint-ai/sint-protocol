/**
 * Industrial humanoid shipyard safety pack conformance.
 *
 * This fixture makes the Persona-style use case executable without depending on
 * Persona internals: shipyard humanoids, hot work, welding, confined spaces,
 * bystander safety, simulation receipts, ABS-style evidence export, and
 * support-only safety-case boundaries.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { loadIndustrialHumanoidShipyardSafetyPackFixture } from "./fixture-loader.js";

function riskPriorityNumber(row: {
  readonly severity: number;
  readonly occurrence: number;
  readonly detection: number;
}): number {
  return row.severity * row.occurrence * row.detection;
}

describe("Industrial humanoid shipyard safety pack fixture v1", () => {
  const fixture = loadIndustrialHumanoidShipyardSafetyPackFixture();

  it("declares the shipyard humanoid scope and keeps certification boundaries explicit", () => {
    expect(fixture.fixtureId).toBe("industrial-humanoid-shipyard-safety-pack-v1");
    expect(fixture.deployment.profile).toBe("industrial-humanoid-shipyard");
    expect(fixture.deployment.actors).toEqual(
      expect.arrayContaining(["fire-watch", "abs-remote-surveyor", "safety-plc"]),
    );
    expect(fixture.scopeNote).toContain("not a shipyard certification");
    expect(fixture.scopeNote).toContain("not");
    expect(fixture.successCriteria.claimsRemainSupportOnly).toBe(true);
  });

  it("defines shipyard policy templates for hot work, confined spaces, material handling, and inspection", () => {
    expect(fixture.policyTemplates.map((template) => template.templateId)).toEqual([
      "shipyard-hot-work-welding",
      "shipyard-confined-space-entry",
      "shipyard-material-handling",
      "shipyard-visual-inspection",
    ]);

    const hotWork = fixture.policyTemplates.find(
      (template) => template.templateId === "shipyard-hot-work-welding",
    );
    expect(hotWork?.defaultTier).toBe(ApprovalTier.T3_COMMIT);
    expect(hotWork?.requiredPermits).toEqual(
      expect.arrayContaining([
        "hotWorkPermit",
        "fireWatchReady",
        "fumeExtractionOnline",
        "gasAtmosphereSafe",
        "simulationReceipt",
      ]),
    );

    for (const template of fixture.policyTemplates) {
      expect(template.requiredHardwareSafety).toEqual(
        expect.objectContaining({
          permitState: "granted",
          interlockState: "closed",
          estopState: "clear",
        }),
      );
      expect(template.requiredHardwareSafety.maxObservedAgeMs).toBeLessThanOrEqual(5000);
    }
  });

  it("covers the minimum shipyard hazard scenarios with deterministic decisions", () => {
    const byId = new Map(fixture.shipyardScenarios.map((scenario) => [scenario.id, scenario]));

    expect([...byId.keys()]).toEqual([
      "visual-inspection-allowed",
      "weld-start-without-hot-work-permit",
      "weld-start-fire-watch-not-ready",
      "fume-extraction-offline",
      "unsafe-atmosphere-confined-space",
      "bystander-in-weld-zone",
      "simulation-receipt-mismatch",
      "valid-weld-start-requires-supervisor-approval",
      "material-lift-over-envelope",
      "estop-during-weld",
    ]);

    expect(byId.get("visual-inspection-allowed")?.expectedTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(byId.get("visual-inspection-allowed")?.expectedDecision).toBe("allow");

    expect(byId.get("weld-start-without-hot-work-permit")?.policyViolated).toBe(
      "HOT_WORK_PERMIT_REQUIRED",
    );
    expect(byId.get("weld-start-fire-watch-not-ready")?.policyViolated).toBe(
      "FIRE_WATCH_REQUIRED",
    );
    expect(byId.get("fume-extraction-offline")?.policyViolated).toBe(
      "FUME_EXTRACTION_REQUIRED",
    );
    expect(byId.get("unsafe-atmosphere-confined-space")?.policyViolated).toBe(
      "ATMOSPHERE_UNSAFE",
    );
    expect(byId.get("bystander-in-weld-zone")?.expectedDecision).toBe("escalate");
    expect(byId.get("bystander-in-weld-zone")?.physicalContext?.humanDetected).toBe(true);
    expect(byId.get("simulation-receipt-mismatch")?.policyViolated).toBe(
      "SIMULATION_RECEIPT_MISMATCH",
    );
    expect(byId.get("valid-weld-start-requires-supervisor-approval")?.expectedTier).toBe(
      ApprovalTier.T3_COMMIT,
    );
    expect(byId.get("material-lift-over-envelope")?.policyViolated).toBe(
      "LOAD_LIMIT_EXCEEDED",
    );
    expect(byId.get("estop-during-weld")?.expectedDecision).toBe("rollback");
    expect(byId.get("estop-during-weld")?.rollbackTargetRef).toMatch(/^sint:\/\/action\//);
  });

  it("requires receipts for every shipyard outcome and high-consequence action", () => {
    for (const scenario of fixture.shipyardScenarios) {
      expect(scenario.receiptRequired, scenario.id).toBe(true);
      expect(scenario.hardwareSafety.controllerId, scenario.id).toContain("safety-plc");
      expect(scenario.hardwareSafety.observedAgeMs, scenario.id).toBeLessThanOrEqual(2500);

      if (scenario.operation === "arc_weld_start") {
        expect(scenario.expectedTier, scenario.id).toBe(ApprovalTier.T3_COMMIT);
      }

      if (scenario.expectedDecision !== "allow") {
        expect(scenario.policyViolated, scenario.id).toBeDefined();
      }
    }
  });

  it("binds simulation receipts to offline welding program digests", () => {
    const drift = fixture.shipyardScenarios.find(
      (scenario) => scenario.id === "simulation-receipt-mismatch",
    );
    const valid = fixture.shipyardScenarios.find(
      (scenario) => scenario.id === "valid-weld-start-requires-supervisor-approval",
    );

    expect(drift?.simulation?.expectedProgramDigest).not.toBe(
      drift?.simulation?.submittedProgramDigest,
    );
    expect(drift?.expectedDecision).toBe("deny");
    expect(valid?.simulation?.expectedProgramDigest).toBe(
      valid?.simulation?.submittedProgramDigest,
    );
    expect(valid?.expectedDecision).toBe("escalate");
  });

  it("defines ABS-style evidence export fields and data quality rules", () => {
    expect(fixture.absEvidenceExport.format).toBe("json-lines");
    expect(fixture.absEvidenceExport.requiredFields).toEqual(
      expect.arrayContaining([
        "siteId",
        "vesselBlockId",
        "robotId",
        "workOrderId",
        "weldProcedureSpecId",
        "hotWorkPermitId",
        "gasMonitorCalibrationRef",
        "simulationReceiptDigest",
        "policyDecision",
        "eventHash",
        "previousHash",
      ]),
    );

    expect(fixture.absEvidenceExport.dataQualityRules.map((rule) => rule.ruleId)).toEqual([
      "shipyard-evidence-clock-sync",
      "shipyard-evidence-calibrated-sensors",
      "shipyard-evidence-program-binding",
    ]);
    expect(fixture.successCriteria.absEvidenceExportHasDataQualityRules).toBe(true);
  });

  it("exports FMEA rows tied to executable scenarios", () => {
    const scenarioIds = new Set(fixture.shipyardScenarios.map((scenario) => scenario.id));
    expect(fixture.fmeaExport.length).toBeGreaterThanOrEqual(6);

    for (const row of fixture.fmeaExport) {
      expect(scenarioIds.has(row.sourceScenarioId), row.failureMode).toBe(true);
      expect(riskPriorityNumber(row), row.failureMode).toBeGreaterThan(0);
      expect(row.requiredEvidence, row.failureMode).toContain("eventHash");
      expect(row.sintControl.length, row.failureMode).toBeGreaterThan(0);
    }
  });

  it("keeps the sprint plan complete enough for execution tracking", () => {
    expect(fixture.sprintPlan.duration).toBe("2 weeks");
    expect(fixture.sprintPlan.workstreams.map((stream) => stream.id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
    ]);
    for (const stream of fixture.sprintPlan.workstreams) {
      expect(stream.deliverables.length, stream.name).toBeGreaterThanOrEqual(3);
    }
  });
});
