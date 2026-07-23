/**
 * SINT regulated-data policy tests.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier, type SintCapabilityToken, type SintRequest } from "@pshkv/core";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "../src/gateway.js";
import {
  DefaultRegulatedDataPolicyPlugin,
  type RegulatedDataPolicyPlugin,
} from "../src/regulated-data-policy.js";

const root = generateKeypair();
const agent = generateKeypair();

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeToken(overrides: Partial<Parameters<typeof issueCapabilityToken>[0]> = {}): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "health://intake/*",
      actions: ["summarize", "code", "update"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(),
      revocable: false,
      ...overrides,
    },
    root.privateKey,
  );
  if (!result.ok) throw new Error(`token issuance failed: ${result.error}`);
  return result.value;
}

let seq = 0;
function makeRequest(
  token: SintCapabilityToken,
  overrides: Partial<SintRequest> = {},
): SintRequest {
  const suffix = String(++seq).padStart(4, "0");
  return {
    requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e5${suffix}` as any,
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "health://intake/patient-123/summary",
    action: "summarize",
    params: {
      regulatedData: {
        dataClasses: ["PHI", "PII"],
        purposeOfUse: "TREAT",
        processor: "in-region-model-router",
        region: "us-east-1",
        model: "clinical-summary-local",
        requestedContextFields: ["symptoms", "medications"],
      },
    },
    ...overrides,
  };
}

function makePolicy(overrides: ConstructorParameters<typeof DefaultRegulatedDataPolicyPlugin>[0] = {
  approvedProcessors: ["ehr-core", "billing-service", "in-region-model-router"],
  approvedRegions: ["us-east-1", "us-west-2"],
  approvedModels: ["clinical-summary-local", "billing-code-helper", "intake-triage-approved"],
  allowedPurposes: ["TREAT", "PAYMENT", "ADMIN"],
}) {
  return new DefaultRegulatedDataPolicyPlugin(overrides);
}

describe("DefaultRegulatedDataPolicyPlugin", () => {
  it("does not affect requests without regulated data metadata", () => {
    const token = makeToken();
    const policy = makePolicy();
    const request = makeRequest(token, { params: {} });

    const decision = policy.evaluate(request, token, {
      requestId: request.requestId,
      timestamp: request.timestamp,
    });

    expect(decision).toBeUndefined();
  });

  it("denies unapproved processors before execution", () => {
    const token = makeToken();
    const policy = makePolicy();
    const request = makeRequest(token, {
      params: {
        regulatedData: {
          dataClasses: ["PHI"],
          purposeOfUse: "TREAT",
          processor: "external-processor",
          region: "us-east-1",
          model: "clinical-summary-local",
        },
      },
    });

    const decision = policy.evaluate(request, token, {
      requestId: request.requestId,
      timestamp: request.timestamp,
    });

    expect(decision?.action).toBe("deny");
    expect(decision?.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision?.denial?.policyViolated).toBe("PROCESSOR_NOT_APPROVED");
  });

  it("transforms requests when an approved fallback route is present", () => {
    const token = makeToken();
    const policy = makePolicy();
    const request = makeRequest(token, {
      params: {
        regulatedData: {
          dataClasses: ["PHI", "PII"],
          purposeOfUse: "TREAT",
          processor: "external-processor",
          region: "eu-central-1",
          model: "general-model",
          fallback: {
            processor: "in-region-model-router",
            region: "us-west-2",
            model: "intake-triage-approved",
            transformations: [
              "redact_direct_identifiers",
              "route_to_approved_region",
              "route_to_approved_model",
            ],
          },
        },
      },
    });

    const decision = policy.evaluate(request, token, {
      requestId: request.requestId,
      timestamp: request.timestamp,
    });

    expect(decision?.action).toBe("transform");
    expect(decision?.transformations?.additionalAuditFields).toEqual(
      expect.objectContaining({
        fallbackProcessor: "in-region-model-router",
        fallbackRegion: "us-west-2",
        fallbackModel: "intake-triage-approved",
      }),
    );
  });

  it("minimizes delegated context by token id", () => {
    const token = makeToken({ resource: "health://billing/*", actions: ["code"] });
    const policy = makePolicy({
      approvedProcessors: ["billing-service"],
      approvedRegions: ["us-east-1"],
      approvedModels: ["billing-code-helper"],
      allowedPurposes: ["PAYMENT"],
      allowedContextFieldsByTokenId: {
        [token.tokenId]: ["encounter_code", "insurance_plan"],
      },
    });
    const request = makeRequest(token, {
      resource: "health://billing/claim-456/code",
      action: "code",
      params: {
        regulatedData: {
          dataClasses: ["PII", "ADMIN"],
          purposeOfUse: "PAYMENT",
          processor: "billing-service",
          region: "us-east-1",
          model: "billing-code-helper",
          requestedContextFields: [
            "encounter_code",
            "insurance_plan",
            "treatment_notes",
          ],
        },
      },
    });

    const decision = policy.evaluate(request, token, {
      requestId: request.requestId,
      timestamp: request.timestamp,
    });

    expect(decision?.action).toBe("transform");
    expect(decision?.assignedTier).toBe(ApprovalTier.T1_PREPARE);
    expect(decision?.transformations?.additionalAuditFields).toEqual(
      expect.objectContaining({
        transformations: ["minimize_context"],
        effectiveContextFields: ["encounter_code", "insurance_plan"],
        minimizedFields: ["treatment_notes"],
      }),
    );
  });
});

describe("RegulatedDataPolicyPlugin — Gateway integration", () => {
  it("short-circuits unsafe regulated data paths through PolicyGateway.intercept", async () => {
    const token = makeToken();
    const tokenStore = new Map([[token.tokenId, token]]);
    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      regulatedDataPolicy: makePolicy(),
    });
    const request = makeRequest(token, {
      params: {
        regulatedData: {
          dataClasses: ["PHI"],
          purposeOfUse: "TREAT",
          processor: "external-processor",
          region: "us-east-1",
          model: "clinical-summary-local",
        },
      },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("PROCESSOR_NOT_APPROVED");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("returns regulated-data transform decisions before normal tier escalation", async () => {
    const token = makeToken();
    const tokenStore = new Map([[token.tokenId, token]]);
    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      regulatedDataPolicy: makePolicy(),
    });
    const request = makeRequest(token, {
      params: {
        regulatedData: {
          dataClasses: ["PHI"],
          purposeOfUse: "TREAT",
          processor: "external-processor",
          region: "eu-central-1",
          model: "general-model",
          fallback: {
            processor: "in-region-model-router",
            region: "us-west-2",
            model: "intake-triage-approved",
            transformations: ["redact_direct_identifiers"],
          },
        },
      },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("transform");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision.transformations?.additionalAuditFields).toEqual(
      expect.objectContaining({
        transformations: ["redact_direct_identifiers"],
      }),
    );
  });

  it("fails closed when the regulated data policy plugin throws", async () => {
    const token = makeToken();
    const tokenStore = new Map([[token.tokenId, token]]);
    const throwingPolicy: RegulatedDataPolicyPlugin = {
      evaluate: () => {
        throw new Error("policy backend unavailable");
      },
    };
    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      regulatedDataPolicy: throwingPolicy,
    });

    const decision = await gateway.intercept(makeRequest(token));

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("REGULATED_DATA_POLICY_ERROR");
  });
});
