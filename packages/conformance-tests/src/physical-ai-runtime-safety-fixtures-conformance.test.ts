/**
 * Physical AI Runtime Safety fixture conformance.
 *
 * Covers the v0.1 working-group fixture pack for pre-actuation policy checks,
 * transport non-bypass, e-stop rollback semantics, and evidence vocabulary.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type {
  SintCapabilityToken,
  SintCapabilityTokenRequest,
  SintRequest,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { checkSros2Permission } from "@pshkv/bridge-ros2";
import { loadPhysicalAiRuntimeSafetyFixture } from "./fixture-loader.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function replaceNowPlaceholder<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/"__NOW__"/g, JSON.stringify(nowISO8601())),
  ) as T;
}

describe("Physical AI runtime safety fixtures v0.1", () => {
  const fixture = loadPhysicalAiRuntimeSafetyFixture();
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let events: Array<{ eventType: string; payload: Record<string, unknown> }>;

  function issueFixtureToken(
    tokenTemplate = fixture.defaultToken,
  ): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: tokenTemplate.resource,
      actions: [...tokenTemplate.actions],
      constraints: { ...(tokenTemplate.constraints ?? {}) },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
    };
    const issued = issueCapabilityToken(req, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Fixture token issuance failed: ${issued.error}`);
    }
    tokenStore.set(issued.value.tokenId, issued.value);
    return issued.value;
  }

  function semanticEventTypes(): string[] {
    const types = new Set(events.map((event) => event.eventType));
    for (const event of events) {
      if (event.eventType !== "policy.evaluated") continue;
      const decision = event.payload["decision"];
      if (decision === "allow" || decision === "deny" || decision === "escalate") {
        types.add(`policy.decision.${decision}`);
      }
    }
    return [...types];
  }

  beforeEach(() => {
    tokenStore = new Map();
    events = [];
    revocationStore.clear();
    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      revocationStore,
      emitLedgerEvent: (event) => events.push(event as (typeof events)[number]),
    });
  });

  it("declares a stable physical-AI interoperability profile", () => {
    expect(fixture.fixtureId).toBe("physical-ai-runtime-safety-v0.1");
    expect(fixture.profile.transport).toBe("ros2/sros2");
    expect(fixture.profile.actionBoundary).toBe("pre-actuation");
    expect(fixture.profile.decisionVocabulary).toEqual([
      "allow",
      "deny",
      "escalate",
      "rollback",
    ]);
    expect(fixture.profile.evidenceRequirements).toEqual({
      decisionRefRequired: true,
      actionIntentRefRequired: true,
      hashChainRequired: true,
    });

    const ids = fixture.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of fixture.cases) {
      expect(fixture.profile.decisionVocabulary).toContain(c.expected.decisionAction);
      expect(fixture.profile.transportOutcomes).toContain(c.expected.transportOutcome);
    }
  });

  it.each(fixture.cases.filter((c) => c.transportCheck !== undefined))(
    "enforces SROS2 transport non-bypass: $id",
    (c) => {
      const transportCheck = c.transportCheck;
      expect(transportCheck).toBeDefined();
      if (!transportCheck) return;

      const decision = checkSros2Permission(
        {
          ...transportCheck.enclave,
          allowPublish: [...transportCheck.enclave.allowPublish],
          allowSubscribe: [...transportCheck.enclave.allowSubscribe],
          denyPublish: [...transportCheck.enclave.denyPublish],
          denySubscribe: [...transportCheck.enclave.denySubscribe],
        },
        transportCheck.topicName,
        transportCheck.operation,
      );

      expect(decision).toBe(c.expected.transportDecision);
      expect(c.expected.decisionAction).toBe("deny");
      expect(c.expected.transportOutcome).toBe("publish_rejected");
      expect(c.expected.evidenceEventType).toBe("transport.sros2.publish_rejected");
    },
  );

  it.each(fixture.cases.filter((c) => c.request !== undefined))(
    "matches gateway decision semantics: $id",
    async (c) => {
      const requestTemplate = c.request;
      expect(requestTemplate).toBeDefined();
      if (!requestTemplate) return;

      const token = issueFixtureToken(c.tokenOverride ?? fixture.defaultToken);
      const renderedRequest = replaceNowPlaceholder(requestTemplate);
      const request: SintRequest = {
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: renderedRequest.resource,
        action: renderedRequest.action,
        params: renderedRequest.params ?? {},
        physicalContext: renderedRequest.physicalContext,
        recentActions: renderedRequest.recentActions,
        executionContext: renderedRequest.executionContext,
      };

      const decision = await gateway.intercept(request);

      if (c.expected.decisionAction === "rollback") {
        expect(decision.action).toBe("deny");
        expect(decision.denial?.policyViolated).toBe(c.expected.policyViolated);
      } else {
        expect(decision.action).toBe(c.expected.decisionAction);
      }

      if (c.expected.assignedTier) {
        expect(decision.assignedTier).toBe(c.expected.assignedTier);
      }
      if (c.expected.policyViolated && c.expected.decisionAction !== "rollback") {
        expect(decision.denial?.policyViolated).toBe(c.expected.policyViolated);
      }
      if (c.expected.evidenceEventType) {
        expect(semanticEventTypes()).toContain(c.expected.evidenceEventType);
      }

      if (c.expected.evidence) {
        expect(events.length).toBeGreaterThan(0);
        expect(c.expected.evidence.decisionRefRequired).toBe(true);
        expect(c.expected.evidence.actionIntentRefRequired).toBe(true);
        expect(c.expected.evidence.hashChainRequired).toBe(true);
      }
    },
  );
});
