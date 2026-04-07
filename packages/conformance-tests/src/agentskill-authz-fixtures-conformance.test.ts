/**
 * AgentSkill delegated-authority fixture conformance.
 *
 * Converts the public interop fixture into executable checks for:
 * - subject-bound and scope-bound authorization
 * - revocation and expiry TOCTOU fail-closed behavior
 * - tier-gated attestation requirement enforcement
 */

import { beforeEach, describe, expect, it } from "vitest";
import type {
  SintCapabilityToken,
  SintCapabilityTokenRequest,
  SintRequest,
} from "@sint/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import {
  loadAgentSkillDelegatedAuthorityFixture,
  type AgentSkillDelegatedAuthorityFixture,
} from "./fixture-loader.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function isoAtOffsetMs(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function assertFixtureShape(fixture: AgentSkillDelegatedAuthorityFixture): void {
  expect(fixture.fixtureId).toBeTypeOf("string");
  expect(fixture.schemaVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(fixture.tokenTemplate.resource).toBeTypeOf("string");
  expect(Array.isArray(fixture.tokenTemplate.actions)).toBe(true);
  expect(fixture.tokenTemplate.actions.length).toBeGreaterThan(0);
  expect(Number.isInteger(fixture.tokenTemplate.delegationDepth)).toBe(true);
  expect(fixture.cases.length).toBeGreaterThanOrEqual(4);

  for (const scenario of fixture.cases) {
    expect(scenario.name).toBeTypeOf("string");
    expect(scenario.request.resource).toBeTypeOf("string");
    expect(scenario.request.action).toBeTypeOf("string");
    expect(["allow", "deny", "escalate", "transform"]).toContain(
      scenario.expected.decisionAction,
    );
  }
}

describe("AgentSkill Delegated Authority Fixture Conformance", () => {
  const fixture = loadAgentSkillDelegatedAuthorityFixture();
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;

  function issueAndStore(
    overrides: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: fixture.tokenTemplate.resource,
      actions: [...fixture.tokenTemplate.actions],
      constraints: {},
      delegationChain: {
        parentTokenId: null,
        depth: fixture.tokenTemplate.delegationDepth,
        attenuated: false,
      },
      expiresAt: futureISO(2),
      revocable: fixture.tokenTemplate.revocable ?? true,
      ...overrides,
    };

    const issued = issueCapabilityToken(req, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }
    tokenStore.set(issued.value.tokenId, issued.value);
    return issued.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      revocationStore,
    });
  });

  it("fixture has required schema and executable scenarios", () => {
    assertFixtureShape(fixture);
  });

  it("enforces delegated authority scenarios at the AgentSkill boundary", async () => {
    for (const scenario of fixture.cases) {
      const overrides: Partial<SintCapabilityTokenRequest> = {
        ...(scenario.tokenOverrides?.resource !== undefined
          ? { resource: scenario.tokenOverrides.resource }
          : {}),
        ...(scenario.tokenOverrides?.actions !== undefined
          ? { actions: [...scenario.tokenOverrides.actions] }
          : {}),
        ...(scenario.tokenOverrides?.expiresAt !== undefined
          ? {
              expiresAt:
                scenario.tokenOverrides.expiresAt === "__SHORT_LIVED__"
                  ? isoAtOffsetMs((scenario.lifecycle?.expireBeforeInterceptMs ?? 200) + 100)
                  : scenario.tokenOverrides.expiresAt,
            }
          : {}),
        ...(scenario.tokenOverrides?.attestationRequirements !== undefined
          ? { attestationRequirements: scenario.tokenOverrides.attestationRequirements }
          : {}),
      };

      const token = issueAndStore({
        ...overrides,
      });

      if (scenario.lifecycle?.revokeBeforeIntercept) {
        revocationStore.revoke(
          token.tokenId,
          scenario.lifecycle.revokeBeforeIntercept.reason,
          scenario.lifecycle.revokeBeforeIntercept.revokedBy,
        );
      }

      if (scenario.lifecycle?.expireBeforeInterceptMs !== undefined) {
        await sleep(scenario.lifecycle.expireBeforeInterceptMs + 120);
      }

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: scenario.request.resource,
        action: scenario.request.action,
        params: scenario.request.params ?? {},
        executionContext: scenario.request.executionContext as SintRequest["executionContext"],
      });

      expect(decision.action).toBe(scenario.expected.decisionAction);
      if (scenario.expected.assignedTier) {
        expect(decision.assignedTier).toBe(scenario.expected.assignedTier);
      }
      if (scenario.expected.policyViolated) {
        expect(decision.denial?.policyViolated).toBe(scenario.expected.policyViolated);
      }
    }
  });
});
