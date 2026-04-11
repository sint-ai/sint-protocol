/**
 * Canonical A2A fixture conformance checks.
 *
 * Ensures A2A skill-bound capability enforcement remains deterministic for:
 * - skill scope matching
 * - tiered escalation
 * - token revocation fail-closed behavior
 * - token subject/agent identity binding
 */

import { describe, expect, it } from "vitest";
import type {
  ApprovalTier,
  SintCapabilityToken,
  SintCapabilityTokenRequest,
} from "@sint/core";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import {
  A2AInterceptor,
  type A2AAgentCard,
  type A2ASendTaskParams,
} from "@sint/bridge-a2a";
import { loadA2ASkillCapabilityEnforcementFixture } from "./fixture-loader.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const fixture = loadA2ASkillCapabilityEnforcementFixture();
const root = generateKeypair();
const primaryAgent = generateKeypair();
const secondaryAgent = generateKeypair();

function issueToken(
  request: Omit<SintCapabilityTokenRequest, "issuer" | "subject" | "delegationChain" | "expiresAt" | "revocable">,
): SintCapabilityToken {
  const issued = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: primaryAgent.publicKey,
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(6),
      revocable: true,
      ...request,
    },
    root.privateKey,
  );
  if (!issued.ok) {
    throw new Error(`Token issuance failed: ${issued.error}`);
  }
  return issued.value;
}

function createHarness() {
  const revocationStore = new RevocationStore();
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tokenStore = new Map<string, SintCapabilityToken>();
  const namedTokens = new Map<string, SintCapabilityToken>();

  for (const [name, tokenTemplate] of Object.entries(fixture.tokens)) {
    const token = issueToken({
      resource: tokenTemplate.resource,
      actions: [...tokenTemplate.actions],
      constraints: {},
    });
    tokenStore.set(token.tokenId, token);
    namedTokens.set(name, token);
  }

  const gateway = new PolicyGateway({
    resolveToken: (tokenId) => tokenStore.get(tokenId),
    revocationStore,
    emitLedgerEvent: (event) => {
      events.push({ eventType: event.eventType, payload: event.payload });
    },
  });

  return { gateway, revocationStore, events, namedTokens };
}

describe("A2A Fixture Conformance", () => {
  for (const scenario of fixture.cases) {
    it(scenario.name, async () => {
      const { gateway, revocationStore, events, namedTokens } = createHarness();
      const token = namedTokens.get(scenario.tokenRef);
      if (!token) {
        throw new Error(`Fixture tokenRef missing: ${scenario.tokenRef}`);
      }

      if (scenario.preRevoked) {
        revocationStore.revoke(token.tokenId, "fixture revocation", "conformance");
      }

      const agentId = scenario.agentRef === "primary"
        ? primaryAgent.publicKey
        : secondaryAgent.publicKey;

      const interceptor = new A2AInterceptor(gateway, agentId, token.tokenId, {
        agentCard: fixture.agentCard as A2AAgentCard,
      });

      const result = await interceptor.interceptSend(scenario.request as A2ASendTaskParams);
      expect(result.action).toBe(scenario.expected.interceptAction);

      if (scenario.expected.assignedTier) {
        const sintMeta = result.task.metadata?.["sint"] as { assignedTier?: ApprovalTier } | undefined;
        expect(sintMeta?.assignedTier).toBe(scenario.expected.assignedTier);
      }

      if (scenario.expected.policyViolated) {
        expect(result.action).toBe("deny");
        if (result.action === "deny") {
          expect(result.policyViolated).toBe(scenario.expected.policyViolated);
        }
      }

      if (scenario.expected.expectedEvidenceEvent) {
        const emitted = events.some((event) => event.eventType === scenario.expected.expectedEvidenceEvent);
        expect(emitted).toBe(true);
      }
    });
  }
});

