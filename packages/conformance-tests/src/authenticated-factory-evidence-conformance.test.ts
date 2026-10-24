import { describe, expect, it } from "vitest";
import { err, ok, type DeploymentEvidenceRef, type InspectionReceipt, type SintCapabilityTokenRequest, type SintRequest } from "@pshkv/core";
import { generateKeypair, generateUUIDv7, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { PolicyGateway, type PolicyGatewayConfig } from "@pshkv/gate-policy-gateway";

const issuer = generateKeypair();
const agent = generateKeypair();
const iso = (offset = 0) => new Date(Date.now() + offset).toISOString();

function setup(
  envelopes: Pick<SintCapabilityTokenRequest, "deploymentEnvelope" | "manufacturingEnvelope">,
  executionContext: SintRequest["executionContext"],
  config: Partial<PolicyGatewayConfig> = {},
) {
  const issued = issueCapabilityToken({
    issuer: issuer.publicKey, subject: agent.publicKey,
    resource: "factory:///parts/PN-42", actions: ["execute"], constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: iso(3_600_000), revocable: true, ...envelopes,
  }, issuer.privateKey);
  expect(issued.ok).toBe(true);
  if (!issued.ok) return undefined;
  const request: SintRequest = {
    requestId: generateUUIDv7(), timestamp: iso(), agentId: agent.publicKey,
    tokenId: issued.value.tokenId, resource: issued.value.resource, action: "execute",
    params: {}, executionContext,
  };
  return { request, gateway: new PolicyGateway({ resolveToken: () => issued.value, ...config }) };
}

function evidence(): DeploymentEvidenceRef {
  return { evidenceType: "site-permit", evidenceRef: "permit://factory-7", proofHash: "a".repeat(64), verifierRef: "verifier://site", observedAt: iso() };
}

function receipt(): InspectionReceipt {
  return {
    receiptId: generateUUIDv7(), receiptRef: "inspection://PN-42/B", partNumber: "PN-42", revision: "B",
    calibrationState: "fresh", calibrationValidUntil: iso(60_000), inspectedAt: iso(), disposition: "pass",
    measuredFeatureResults: [{ featureName: "diameter", measuredValue: 10.01, nominalValue: 10,
      lowerTolerance: -0.05, upperTolerance: 0.05, withinTolerance: true }],
  };
}

describe("Authenticated factory evidence conformance", () => {
  it.each(["deploymentEnvelope", "manufacturingEnvelope"] as const)("rejects caller-only proof in %s", async envelopeKey => {
    const proof = evidence();
    const input = setup({ [envelopeKey]: { requiredEvidenceRefs: [proof], proofFreshness: { maxProofAgeMs: 5_000 } } }, {
      deploymentEvidence: [proof], manufacturingExecution: {},
    });
    if (!input) return;
    const decision = await input.gateway.intercept(input.request);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("DEPLOYMENT_PROOF_UNVERIFIED");
  });

  it("allows evidence authenticated against an independent record", async () => {
    const proof = evidence();
    const input = setup({ deploymentEnvelope: { requiredEvidenceRefs: [proof], proofFreshness: { maxProofAgeMs: 5_000 } } },
      { deploymentEvidence: [proof] }, { resolveDeploymentEvidence: () => ok(structuredClone(proof)) });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).action).toBe("allow");
  });

  it("rejects a current caller timestamp substituted for a stale authenticated observation", async () => {
    const proof = evidence();
    const input = setup({ deploymentEnvelope: { requiredEvidenceRefs: [{ evidenceType: proof.evidenceType, evidenceRef: proof.evidenceRef, proofHash: proof.proofHash }], proofFreshness: { maxProofAgeMs: 5_000 } } },
      { deploymentEvidence: [proof] }, { resolveDeploymentEvidence: () => ok({ ...proof, observedAt: iso(-60_000) }) });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("DEPLOYMENT_PROOF_UNVERIFIED");
  });

  it("rejects absent proof even when the caller knows its pinned hash and verifier", async () => {
    const proof = evidence();
    const input = setup({ deploymentEnvelope: { requiredEvidenceRefs: [proof] } }, { deploymentEvidence: [proof] },
      { resolveDeploymentEvidence: () => err({ message: "not found" }) });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("DEPLOYMENT_PROOF_UNVERIFIED");
  });

  it.each(["proofHash", "verifierRef"] as const)("rejects a substituted authenticated %s", async field => {
    const proof = evidence();
    const input = setup({ deploymentEnvelope: { requiredEvidenceRefs: [proof] } }, { deploymentEvidence: [proof] },
      { resolveDeploymentEvidence: () => ok({ ...proof, [field]: field === "proofHash" ? "b".repeat(64) : "verifier://other" }) });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("DEPLOYMENT_PROOF_UNVERIFIED");
  });

  it("fails closed and audits an unresponsive evidence resolver", async () => {
    const proof = evidence();
    const input = setup({ deploymentEnvelope: { requiredEvidenceRefs: [proof] } }, { deploymentEvidence: [proof] },
      { pluginTimeoutMs: 10, resolveDeploymentEvidence: () => new Promise(() => {}) });
    if (!input) return;
    const decision = await input.gateway.intercept(input.request);
    expect(decision.action).toBe("deny");
    expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(
      expect.objectContaining({ seat: "deploymentEnvelope.evaluate", kind: "timeout", policy: "deny" }));
  });

  it("denies fabricated passing inspection receipts without a trusted resolver", async () => {
    const input = setup({ manufacturingEnvelope: { inspectionRequired: true } }, { manufacturingExecution: { inspectionReceipt: receipt() } });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("FACTORY_PROOF_MISSING");
  });

  it("rejects modification of a real receipt's disposition", async () => {
    const trusted = { ...receipt(), disposition: "fail" as const };
    const input = setup({ manufacturingEnvelope: { inspectionRequired: true } }, {
      manufacturingExecution: { inspectionReceipt: { ...trusted, disposition: "pass" } },
    }, { resolveInspectionReceipt: () => ok(trusted) });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("FACTORY_CONTEXT_MISMATCH");
  });

  it.each(["inline", "reference"] as const)("accepts authenticated %s inspection evidence", async mode => {
    const trusted = receipt();
    const input = setup({ manufacturingEnvelope: { inspectionRequired: true, partNumber: "PN-42", revision: "B" } }, {
      manufacturingExecution: { partNumber: "PN-42", revision: "B", ...(mode === "inline"
        ? { inspectionReceipt: trusted } : { inspectionReceiptRef: trusted.receiptRef }) },
    }, { resolveInspectionReceipt: () => ok(trusted) });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).action).toBe("allow");
  });

  it.each(["expired", "outside-tolerance", "false-pass", "future", "wrong-part"] as const)("denies authenticated but unsafe inspection evidence: %s", async failure => {
    const trusted = receipt();
    const invalid = {
      ...trusted,
      ...(failure === "expired" && { calibrationValidUntil: iso(-1) }),
      ...(failure === "future" && { inspectedAt: iso(30_000) }),
      ...(failure === "wrong-part" && { partNumber: "PN-OTHER" }),
      ...((failure === "outside-tolerance" || failure === "false-pass") && { measuredFeatureResults: [{
        ...trusted.measuredFeatureResults[0]!,
        ...(failure === "outside-tolerance" ? { withinTolerance: false } : { measuredValue: 11 }),
      }] }),
    };
    const input = setup({ manufacturingEnvelope: { inspectionRequired: true, partNumber: "PN-42" } }, {
      manufacturingExecution: { partNumber: "PN-42", inspectionReceipt: invalid },
    }, { resolveInspectionReceipt: () => ok(invalid) });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).action).toBe("deny");
  });
});
