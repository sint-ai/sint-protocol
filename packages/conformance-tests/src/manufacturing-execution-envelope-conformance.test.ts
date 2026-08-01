import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SintCapabilityTokenRequest, SintRequest } from "@pshkv/core";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(
  REPO_ROOT,
  "packages/conformance-tests/fixtures/industrial/manufacturing-execution-envelope.v1.json",
);

type ManufacturingFixture = {
  readonly token: Pick<SintCapabilityTokenRequest,
    | "resource"
    | "actions"
    | "deploymentEnvelope"
    | "manufacturingEnvelope"
    | "constraints"
  > & {
    readonly executionContext: NonNullable<SintRequest["executionContext"]>;
  };
};

function futureISO(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function pastISO(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function loadFixture(): ManufacturingFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ManufacturingFixture;
}

describe("Manufacturing execution envelope conformance", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const fixture = loadFixture();

  function issueToken(overrides: Partial<SintCapabilityTokenRequest> = {}) {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: fixture.token.resource,
      actions: fixture.token.actions,
      constraints: fixture.token.constraints,
      deploymentEnvelope: fixture.token.deploymentEnvelope,
      manufacturingEnvelope: fixture.token.manufacturingEnvelope,
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const issued = issueCapabilityToken(request, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Failed to issue token: ${issued.error}`);
    }
    return issued.value;
  }

  function makeGateway(tokenRequest: Partial<SintCapabilityTokenRequest> = {}) {
    const token = issueToken(tokenRequest);
    return {
      token,
      gateway: new PolicyGateway({
        resolveToken: () => token,
      }),
    };
  }

  function makeRequest(
    token: Awaited<ReturnType<typeof issueToken>>,
    executionContext: NonNullable<SintRequest["executionContext"]>,
  ): SintRequest {
    return {
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e9aaaa" as any,
      timestamp: futureISO(0),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: token.resource,
      action: token.actions[0]!,
      params: {},
      executionContext,
    };
  }

  function freshExecutionContext(
    manufacturingExecutionOverrides: Partial<NonNullable<
      NonNullable<SintRequest["executionContext"]>["manufacturingExecution"]
    >> = {},
    deploymentEvidenceObservedAt = futureISO(0),
  ): NonNullable<SintRequest["executionContext"]> {
    return {
      ...fixture.token.executionContext,
      deploymentEvidence: [
        {
          evidenceType: "inspection",
          evidenceRef: "inspection://part-42",
          proofHash: "a".repeat(64),
          verifierRef: "verifier://inspection-attestor",
          observedAt: deploymentEvidenceObservedAt,
          maxAgeMs: 5000,
        },
      ],
      manufacturingExecution: {
        ...fixture.token.executionContext.manufacturingExecution,
        ...manufacturingExecutionOverrides,
      },
    };
  }

  it("allows matching manufacturing execution evidence", async () => {
    const { token, gateway } = makeGateway();
    const decision = await gateway.intercept(makeRequest(token, freshExecutionContext()));
    expect(decision.action).toBe("allow");
  });

  it("denies a program digest mismatch", async () => {
    const { token, gateway } = makeGateway();
    const request = makeRequest(token, {
      ...freshExecutionContext({
        camProgramDigest: "d".repeat(64),
      }),
    });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("FACTORY_CONTEXT_MISMATCH");
  });

  it("denies when required inspection evidence is stale", async () => {
    const { token, gateway } = makeGateway();
    const request = makeRequest(token, {
      ...freshExecutionContext({}, pastISO(2)),
      deploymentEvidence: [
        {
          evidenceType: "inspection",
          evidenceRef: "inspection://part-42",
          proofHash: "a".repeat(64),
          verifierRef: "verifier://inspection-attestor",
          observedAt: "2026-07-31T18:00:00.000000Z",
          maxAgeMs: 1,
        },
      ],
    });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("DEPLOYMENT_PROOF_STALE");
  });
});
