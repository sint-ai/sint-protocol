import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateKeypair,
  issueCapabilityToken,
  nowISO8601,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(
  ROOT,
  "packages/conformance-tests/fixtures/deployment-envelope/deployment-envelope-base.v1.json",
);

interface DeploymentEnvelopeFixture {
  readonly fixtureId: string;
  readonly schemaVersion: string;
  readonly description: string;
  readonly token: {
    readonly resource: string;
    readonly actions: readonly string[];
    readonly deploymentEnvelope: {
      readonly contextualBinding: Record<string, unknown>;
      readonly proofFreshness: Record<string, unknown>;
      readonly requiredEvidenceRefs: readonly Array<Record<string, unknown>>;
      readonly allowedVerifiers: readonly string[];
    };
  };
  readonly positiveRequest: {
    readonly resource: string;
    readonly action: string;
    readonly executionContext: Record<string, unknown>;
  };
  readonly negativeCases: readonly string[];
  readonly conformanceCommand: string;
}

function readFixture(): DeploymentEnvelopeFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as DeploymentEnvelopeFixture;
}

function futureISO(hours = 1): string {
  return new Date(Date.now() + hours * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Deployment envelope base conformance", () => {
  it("keeps the shared fixture, command, and negative-case list intact", () => {
    const fixture = readFixture();
    expect(fixture.fixtureId).toBe("deployment-envelope-base-v1");
    expect(fixture.schemaVersion).toBe("1.0.0");
    expect(fixture.negativeCases).toEqual([
      "missing_deployment_evidence",
      "stale_deployment_evidence",
      "wrong_deployment_context",
    ]);
    expect(fixture.conformanceCommand).toContain(
      "src/deployment-envelope-base-conformance.test.ts",
    );
  });

  it("allows the positive request shape and fails closed on missing evidence", async () => {
    const fixture = readFixture();
    const root = generateKeypair();
    const agent = generateKeypair();
    const tokenResult = issueCapabilityToken(
      {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: fixture.token.resource,
        actions: [...fixture.token.actions],
        constraints: {},
        deploymentEnvelope: fixture.token.deploymentEnvelope,
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(12),
        revocable: false,
      },
      root.privateKey,
    );
    expect(tokenResult.ok).toBe(true);
    if (!tokenResult.ok) return;

    const gateway = new PolicyGateway({
      resolveToken: () => tokenResult.value,
    });

    const positiveExecutionContext = {
      ...fixture.positiveRequest.executionContext,
      deploymentEvidence: (
        fixture.positiveRequest.executionContext.deploymentEvidence as readonly Record<string, unknown>[]
      ).map((entry) => ({ ...entry, observedAt: nowISO8601() })),
    };

    const allowDecision = await gateway.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e70001" as any,
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: tokenResult.value.tokenId,
      resource: fixture.positiveRequest.resource,
      action: fixture.positiveRequest.action,
      params: {},
      executionContext: positiveExecutionContext,
    });

    expect(allowDecision.action).toBe("allow");

    const denyDecision = await gateway.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e70002" as any,
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: tokenResult.value.tokenId,
      resource: fixture.positiveRequest.resource,
      action: fixture.positiveRequest.action,
      params: {},
      executionContext: {
        deploymentProfile: "warehouse-amr",
        siteId: "site-9",
        bridgeId: "bridge-1",
        bridgeProtocol: "ros2",
        executor: { nodeId: "robot-7", runtimeId: "fleet-alpha" },
        preapprovedCorridor: { corridorId: "corridor-3", expiresAt: futureISO(1) },
        hardwareSafety: { permitState: "granted", interlockState: "closed", estopState: "clear", observedAt: futureISO(0), controllerId: "plc-1" },
      },
    });

    expect(denyDecision.action).toBe("deny");
    expect(denyDecision.denial?.policyViolated).toBe("DEPLOYMENT_PROOF_MISSING");
  });
});
