/**
 * Automotive and industrial-cell safety pack conformance.
 *
 * H5 translates existing SINT hardware-safety primitives into a safety-case
 * support pack: industrial cell policy templates, FMEA rows, timing KPIs, and
 * SOTIF / ISO 26262 support boundaries.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import {
  defaultTierForOpcUaOperation,
  isSafetyCriticalNode,
  opcUaNodeToResourceUri,
} from "@pshkv/bridge-opcua";
import {
  loadHardwareSafetyPhaseAKpisFixture,
  loadIndustrialCellSafetyPackFixture,
} from "./fixture-loader.js";

function riskPriorityNumber(row: {
  readonly severity: number;
  readonly occurrence: number;
  readonly detection: number;
}): number {
  return row.severity * row.occurrence * row.detection;
}

describe("Industrial cell safety pack fixture v1", () => {
  const fixture = loadIndustrialCellSafetyPackFixture();

  it("declares support-only safety-case boundaries", () => {
    expect(fixture.fixtureId).toBe("industrial-cell-safety-pack-v1");
    expect(fixture.deployment.profile).toBe("industrial-humanoid-cell");
    expect(fixture.scopeNote).toContain("not an ISO 26262");
    expect(fixture.successCriteria.claimsRemainSupportOnly).toBe(true);
  });

  it("defines industrial policy templates with hardware safety requirements", () => {
    expect(fixture.policyTemplates.map((template) => template.templateId)).toEqual([
      "industrial-cell-guard-door",
      "industrial-cell-zone-reservation",
      "industrial-cell-manipulation",
    ]);

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

  it("covers guard-door interlock, zone occupancy, permit revocation, and e-stop scenarios", () => {
    expect(fixture.cellScenarios.map((scenario) => scenario.id)).toEqual([
      "guard-door-open",
      "zone-occupied",
      "permit-revoked-before-actuation",
      "emergency-stop-under-load",
    ]);

    const guardDoor = fixture.cellScenarios.find((scenario) => scenario.id === "guard-door-open");
    expect(guardDoor?.expectedDecision).toBe("deny");
    expect(guardDoor?.policyViolated).toBe("HARDWARE_INTERLOCK_OPEN");
    expect(guardDoor?.evidenceEvent).toBe("safety.hardware.interlock.open");

    const occupied = fixture.cellScenarios.find((scenario) => scenario.id === "zone-occupied");
    expect(occupied?.physicalContext?.humanDetected).toBe(true);
    expect(occupied?.policyViolated).toBe("ZONE_OCCUPIED_BY_HUMAN");

    const revoked = fixture.cellScenarios.find(
      (scenario) => scenario.id === "permit-revoked-before-actuation",
    );
    expect(revoked?.hardwareSafety.permitState).toBe("denied");
    expect(revoked?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");

    const estop = fixture.cellScenarios.find(
      (scenario) => scenario.id === "emergency-stop-under-load",
    );
    expect(estop?.expectedDecision).toBe("rollback");
    expect(estop?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(estop?.rollbackTargetRef).toMatch(/^sint:\/\/action\//);
  });

  it("maps safety-controller OPC UA resources into high-consequence handling", () => {
    const interlockResource = opcUaNodeToResourceUri(
      "ns=2;s=Cell7/GuardDoor/Interlock",
      "opc.tcp://safety-plc.local",
    );
    expect(fixture.deployment.resources).toContain(interlockResource);
    expect(isSafetyCriticalNode("ns=2;s=Cell7/GuardDoor/Interlock")).toBe(true);
    expect(defaultTierForOpcUaOperation("write", "ns=2;s=Cell7/GuardDoor/Interlock")).toBe(
      ApprovalTier.T3_COMMIT,
    );
  });

  it("exports FMEA rows that reference executable scenarios and evidence fields", () => {
    const scenarioIds = new Set(fixture.cellScenarios.map((scenario) => scenario.id));
    expect(fixture.fmeaExport.length).toBe(fixture.cellScenarios.length);

    for (const row of fixture.fmeaExport) {
      expect(scenarioIds.has(row.sourceScenarioId), row.failureMode).toBe(true);
      expect(riskPriorityNumber(row), row.failureMode).toBeGreaterThan(0);
      expect(row.requiredEvidence, row.failureMode).toContain("eventHash");
      expect(row.sintControl.length, row.failureMode).toBeGreaterThan(0);
    }
  });

  it("anchors timing report to hardware permit and e-stop KPIs", () => {
    const kpis = loadHardwareSafetyPhaseAKpisFixture();
    const kpiNames = kpis.kpis.map((kpi) => kpi.name);

    for (const required of fixture.timingReport.requiredKpis) {
      expect(kpiNames, required).toContain(required);
    }

    const permit = kpis.kpis.find((kpi) => kpi.name === "Hardware permit handshake p99");
    const estop = kpis.kpis.find((kpi) => kpi.name === "E-stop propagation p99");
    const failOpen = kpis.kpis.find((kpi) => kpi.name === "T2/T3 fail-open incidents");
    expect(permit?.targetMs).toBeLessThanOrEqual(40);
    expect(estop?.targetMs).toBeLessThanOrEqual(20);
    expect(failOpen?.targetCount).toBe(0);
    expect(fixture.timingReport.requiresBenchmarkReport).toBe(true);
  });

  it("keeps SOTIF / ISO 26262 language as alignment support, not certification", () => {
    expect(fixture.sotifIso26262Mapping.length).toBeGreaterThanOrEqual(4);
    for (const mapping of fixture.sotifIso26262Mapping) {
      expect(mapping.sintSupport.length, mapping.topic).toBeGreaterThan(0);
      expect(mapping.claimBoundary, mapping.topic).toMatch(/support|requires assessor|does not replace/);
    }
  });
});
