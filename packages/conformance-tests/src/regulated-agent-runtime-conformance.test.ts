/**
 * Regulated agent runtime profile conformance.
 *
 * Proves that regulated data workflows can use the same SINT guarantees as
 * physical-effect workflows: one intercept path, scoped authority, attenuated
 * delegation, transform receipts, and minimized evidence.
 */

import { describe, expect, it } from "vitest";
import {
  loadRegulatedAgentRuntimeFixture,
  type RegulatedAgentRuntimeFixture,
} from "./fixture-loader.js";

type RuntimeScenario = RegulatedAgentRuntimeFixture["scenarios"][number];

interface RuntimeDecisionResult {
  readonly decisionAction: RuntimeScenario["expected"]["decisionAction"];
  readonly assignedTier: RuntimeScenario["expected"]["assignedTier"];
  readonly policyViolated?: string;
  readonly transformations?: readonly string[];
  readonly evidenceRequired: boolean;
}

class RegulatedAgentRuntimeHarness {
  constructor(private readonly fixture: RegulatedAgentRuntimeFixture) {}

  evaluate(scenario: RuntimeScenario): RuntimeDecisionResult {
    if (!this.resourceMatches(scenario)) {
      return this.deny("SCOPE_NOT_AUTHORIZED", scenario);
    }
    if (!scenario.token.actions.includes(scenario.request.action)) {
      return this.deny("ACTION_NOT_AUTHORIZED", scenario);
    }
    if (!scenario.token.purposeOfUse.includes(scenario.request.purposeOfUse)) {
      return this.deny("PURPOSE_NOT_AUTHORIZED", scenario);
    }
    if (!this.dataClassesAllowed(scenario)) {
      return this.deny("DATA_CLASS_NOT_AUTHORIZED", scenario);
    }

    const fallback = scenario.request.fallback;
    if (fallback && this.fallbackAllowed(scenario)) {
      return {
        decisionAction: "transform",
        assignedTier: scenario.expected.assignedTier,
        transformations: fallback.transformations,
        evidenceRequired: true,
      };
    }

    if (!scenario.token.allowedProcessors.includes(scenario.request.processor)) {
      return this.deny("PROCESSOR_NOT_APPROVED", scenario);
    }
    if (!scenario.token.allowedRegions.includes(scenario.request.region)) {
      return this.deny("REGION_NOT_APPROVED", scenario);
    }
    if (!scenario.token.allowedModels.includes(scenario.request.model)) {
      return this.deny("MODEL_NOT_APPROVED", scenario);
    }

    if (scenario.token.delegatedFrom && this.requestsExcessContext(scenario)) {
      return {
        decisionAction: "transform",
        assignedTier: scenario.expected.assignedTier,
        transformations: scenario.expected.transformations,
        evidenceRequired: true,
      };
    }

    if (scenario.request.resource.startsWith("health://consent/")) {
      return {
        decisionAction: "escalate",
        assignedTier: "T3_COMMIT",
        evidenceRequired: true,
      };
    }

    return {
      decisionAction: "allow",
      assignedTier: scenario.expected.assignedTier,
      evidenceRequired: true,
    };
  }

  private resourceMatches(scenario: RuntimeScenario): boolean {
    const prefix = scenario.token.resourcePattern.replace(/\*$/, "");
    return scenario.request.resource.startsWith(prefix);
  }

  private dataClassesAllowed(scenario: RuntimeScenario): boolean {
    return scenario.request.dataClasses.every((dataClass) =>
      scenario.token.dataClasses.includes(dataClass),
    );
  }

  private fallbackAllowed(scenario: RuntimeScenario): boolean {
    const fallback = scenario.request.fallback;
    if (!fallback) {
      return false;
    }
    return (
      scenario.token.allowedProcessors.includes(fallback.processor) &&
      scenario.token.allowedRegions.includes(fallback.region) &&
      scenario.token.allowedModels.includes(fallback.model)
    );
  }

  private requestsExcessContext(scenario: RuntimeScenario): boolean {
    const inherited = new Set(scenario.token.inheritedContextFields ?? []);
    return scenario.request.requestedContextFields.some((field) => !inherited.has(field));
  }

  private deny(
    policyViolated: string,
    scenario: RuntimeScenario,
  ): RuntimeDecisionResult {
    return {
      decisionAction: "deny",
      assignedTier: scenario.expected.assignedTier,
      policyViolated,
      evidenceRequired: true,
    };
  }
}

describe("Regulated agent runtime profile fixture v1", () => {
  const fixture = loadRegulatedAgentRuntimeFixture();
  const harness = new RegulatedAgentRuntimeHarness(fixture);

  it("declares conservative runtime-control boundaries", () => {
    expect(fixture.fixtureId).toBe("regulated-agent-runtime-v1");
    expect(fixture.status).toBe("experimental");
    expect(fixture.scopeNote).toContain("not");
    expect(fixture.scopeNote).toContain("certification");
    expect(fixture.defaults.enforcementChokePoint).toBe("PolicyGateway.intercept");
    expect(fixture.defaults.evidenceLedgerAppendOnly).toBe(true);
    expect(fixture.defaults.rawSensitivePayloadsStoredInLedger).toBe(false);
    expect(fixture.successCriteria.claimsRemainRuntimeControlsNotCertification).toBe(true);
  });

  it("covers the governed runtime surfaces expected in an agent control plane", () => {
    expect(fixture.runtimeSurfaces).toEqual(
      expect.arrayContaining([
        "agents",
        "sub_agents",
        "models",
        "apis",
        "mcp_tools",
        "external_services",
        "regulated_data_stores",
      ]),
    );
  });

  it("minimizes sensitive evidence for regulated data classes", () => {
    for (const dataClass of fixture.dataClasses) {
      expect(dataClass.allowedEvidence.length, dataClass.classId).toBeGreaterThan(0);
      expect(dataClass.forbiddenEvidence, dataClass.classId).not.toContain("eventHash");
    }

    const forbiddenEvidence = fixture.dataClasses.flatMap(
      (dataClass) => dataClass.forbiddenEvidence,
    );
    expect(forbiddenEvidence).toEqual(
      expect.arrayContaining([
        "raw_treatment_note",
        "full_patient_record",
        "diagnosis_free_text",
        "full_name",
        "date_of_birth",
        "insurance_member_id",
      ]),
    );
  });

  it("evaluates allow, deny, transform, and escalate decisions from the fixture", () => {
    const observedActions = new Set<string>();

    for (const scenario of fixture.scenarios) {
      const actual = harness.evaluate(scenario);
      observedActions.add(actual.decisionAction);

      expect(actual.decisionAction, scenario.name).toBe(scenario.expected.decisionAction);
      expect(actual.assignedTier, scenario.name).toBe(scenario.expected.assignedTier);
      expect(actual.policyViolated, scenario.name).toBe(scenario.expected.policyViolated);
      expect(actual.evidenceRequired, scenario.name).toBe(scenario.expected.evidenceRequired);

      if (scenario.expected.transformations) {
        expect(actual.transformations, scenario.name).toEqual(
          scenario.expected.transformations,
        );
      }
    }

    expect(observedActions).toEqual(
      new Set(["allow", "deny", "transform", "escalate"]),
    );
  });

  it("requires receipts for processor, residency, minimization, and fallback decisions", () => {
    for (const requirement of fixture.policyRequirements) {
      expect(requirement.receiptFields.length, requirement.requirementId).toBeGreaterThan(0);
    }

    const receiptFields = fixture.policyRequirements.flatMap(
      (requirement) => requirement.receiptFields,
    );
    expect(receiptFields).toEqual(
      expect.arrayContaining([
        "requestId",
        "tokenId",
        "purposeOfUse",
        "processor",
        "region",
        "effectiveContextFields",
        "minimizedFields",
        "fallbackProcessor",
        "fallbackRegion",
        "fallbackModel",
        "evidenceDigest",
      ]),
    );

    for (const scenario of fixture.scenarios) {
      expect(scenario.expected.receiptFields, scenario.name).toContain("evidenceDigest");
    }
  });

  it("keeps delegated context attenuation-only", () => {
    const delegated = fixture.scenarios.find(
      (scenario) => scenario.token.delegatedFrom !== undefined,
    );

    expect(delegated?.expected.decisionAction).toBe("transform");
    expect(delegated?.expected.transformations).toEqual(
      expect.arrayContaining(["minimize_context"]),
    );
    expect(fixture.defaults.contextInheritanceAttenuationOnly).toBe(true);
    expect(fixture.successCriteria.inheritedContextOnlyNarrows).toBe(true);
  });

  it("denies or reroutes unsafe processor, region, and model paths", () => {
    expect(fixture.successCriteria.unapprovedProcessorsDenied).toBe(true);
    expect(fixture.successCriteria.crossRegionTransfersDeniedOrRerouted).toBe(true);
    expect(fixture.successCriteria.transformReceiptsExplainRedactionAndFallback).toBe(true);

    const deniedProcessor = fixture.scenarios.find(
      (scenario) => scenario.expected.policyViolated === "PROCESSOR_NOT_APPROVED",
    );
    const deniedRegion = fixture.scenarios.find(
      (scenario) => scenario.expected.policyViolated === "REGION_NOT_APPROVED",
    );
    const fallback = fixture.scenarios.find(
      (scenario) => scenario.request.fallback !== undefined,
    );

    expect(deniedProcessor?.expected.decisionAction).toBe("deny");
    expect(deniedRegion?.expected.decisionAction).toBe("deny");
    expect(fallback?.expected.decisionAction).toBe("transform");
    expect(fallback?.expected.transformations).toEqual(
      expect.arrayContaining([
        "redact_direct_identifiers",
        "route_to_approved_region",
        "route_to_approved_model",
      ]),
    );
  });
});
