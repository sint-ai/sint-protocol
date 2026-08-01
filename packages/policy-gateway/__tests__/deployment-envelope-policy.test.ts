/**
 * Deployment envelope policy tests.
 */

import { describe, expect, it } from "vitest";
import { type SintCapabilityToken, type SintRequest } from "@pshkv/core";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "../src/gateway.js";

const root = generateKeypair();
const agent = generateKeypair();

function futureISO(hours = 1): string {
  return new Date(Date.now() + hours * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function pastISO(hours = 1): string {
  return new Date(Date.now() - hours * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeToken(
  overrides: Partial<Parameters<typeof issueCapabilityToken>[0]> = {},
): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///plan",
      actions: ["publish"],
      constraints: {},
      deploymentEnvelope: {
        contextualBinding: {
          deploymentProfile: "warehouse-amr",
          siteId: "site-9",
          bridgeId: "bridge-1",
          bridgeProtocol: "ros2",
          resource: "ros2:///plan",
          action: "publish",
          robotId: "robot-7",
          zoneId: "corridor-3",
        },
        proofFreshness: {
          maxProofAgeMs: 5_000,
          requireObservedAt: true,
        },
        requiredEvidenceRefs: [
          {
            evidenceType: "site-permit",
            evidenceRef: "permit://site-9/robot-7",
            maxAgeMs: 5_000,
          },
        ],
        allowedVerifiers: ["verifier://deployment-attestor"],
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: false,
      ...overrides,
    },
    root.privateKey,
  );
  if (!result.ok) {
    throw new Error(`Token issuance failed: ${result.error}`);
  }
  return result.value;
}

let seq = 0;
function makeRequest(
  token: SintCapabilityToken,
  overrides: Partial<SintRequest> = {},
): SintRequest {
  const suffix = String(++seq).padStart(4, "0");
    return {
      requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e6${suffix}` as any,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///plan",
      action: "publish",
    params: {},
    executionContext: {
      deploymentProfile: "warehouse-amr",
      siteId: "site-9",
      bridgeId: "bridge-1",
      bridgeProtocol: "ros2",
      executor: {
        nodeId: "robot-7",
        runtimeId: "fleet-alpha",
      },
      preapprovedCorridor: {
        corridorId: "corridor-3",
        expiresAt: futureISO(1),
      },
      hardwareSafety: {
        permitState: "granted",
        interlockState: "closed",
        estopState: "clear",
        observedAt: futureISO(0),
        controllerId: "plc-1",
      },
      deploymentEvidence: [
        {
          evidenceType: "site-permit",
          evidenceRef: "permit://site-9/robot-7",
          proofHash: "a".repeat(64),
          verifierRef: "verifier://deployment-attestor",
          observedAt: futureISO(0),
          maxAgeMs: 5_000,
        },
      ],
    },
    ...overrides,
  };
}

describe("DeploymentEnvelopePolicy", () => {
  it("allows a request with matching context and fresh evidence", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({
      resolveToken: () => token,
    });

    const decision = await gateway.intercept(makeRequest(token));

    expect(decision.action).toBe("allow");
  });

  it("denies a request when required deployment evidence is missing", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({
      resolveToken: () => token,
    });

    const request = makeRequest(token, {
      executionContext: {
        deploymentProfile: "warehouse-amr",
        siteId: "site-9",
        bridgeId: "bridge-1",
        bridgeProtocol: "ros2",
        executor: {
          nodeId: "robot-7",
          runtimeId: "fleet-alpha",
        },
        preapprovedCorridor: {
          corridorId: "corridor-3",
          expiresAt: futureISO(1),
        },
        hardwareSafety: {
          permitState: "granted",
          interlockState: "closed",
          estopState: "clear",
          observedAt: futureISO(0),
          controllerId: "plc-1",
        },
      },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("DEPLOYMENT_PROOF_MISSING");
  });

  it("denies a request when deployment evidence is stale", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({
      resolveToken: () => token,
    });

    const request = makeRequest(token, {
      executionContext: {
        deploymentProfile: "warehouse-amr",
        siteId: "site-9",
        bridgeId: "bridge-1",
        bridgeProtocol: "ros2",
        executor: {
          nodeId: "robot-7",
          runtimeId: "fleet-alpha",
        },
        preapprovedCorridor: {
          corridorId: "corridor-3",
          expiresAt: futureISO(1),
        },
        hardwareSafety: {
          permitState: "granted",
          interlockState: "closed",
          estopState: "clear",
          observedAt: futureISO(0),
          controllerId: "plc-1",
        },
        deploymentEvidence: [
          {
            evidenceType: "site-permit",
            evidenceRef: "permit://site-9/robot-7",
            proofHash: "a".repeat(64),
            verifierRef: "verifier://deployment-attestor",
            observedAt: pastISO(2),
            maxAgeMs: 5_000,
          },
        ],
      },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("DEPLOYMENT_PROOF_STALE");
  });
});
