/**
 * Canonical fixture conformance for security and IoT runtime paths.
 *
 * Covers:
 * - ASI04 supply-chain runtime verification semantics
 * - MQTT session interception + forwarding safety behavior
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway, DefaultSupplyChainVerifier } from "@pshkv/gate-policy-gateway";
import {
  MqttAuthorizationError,
  MqttGatewaySession,
  mqttTopicToResourceUri,
  type MqttClientAdapter,
} from "@pshkv/bridge-iot";
import {
  loadMqttGatewaySessionFixture,
  loadSupplyChainVerificationFixture,
  loadVerifiableComputeCriticalActionsFixture,
} from "./fixture-loader.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Security and IoT Fixture Conformance", () => {
  const root = generateKeypair();
  const agent = generateKeypair();

  let tokenStore: Map<string, SintCapabilityToken>;

  function issueAndStore(overrides: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "*",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
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
  });

  it("supply-chain fixture enforces deny-on-high and warn-on-medium semantics", async () => {
    const fixture = loadSupplyChainVerificationFixture();
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      emitLedgerEvent: (event) => events.push(event as (typeof events)[number]),
      supplyChainVerifier: new DefaultSupplyChainVerifier(),
    });

    const token = issueAndStore({
      resource: fixture.token.resource,
      actions: [...fixture.token.actions],
      modelConstraints: fixture.token.modelConstraints,
    });

    for (const scenario of fixture.cases) {
      const eventsBefore = events.length;
      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: scenario.request.resource,
        action: scenario.request.action,
        params: scenario.request.params ?? {},
        executionContext: scenario.request.executionContext,
      });

      expect(decision.action).toBe(scenario.expected.decisionAction);
      if (scenario.expected.policyViolated) {
        expect(decision.denial?.policyViolated).toBe(scenario.expected.policyViolated);
      }

      if (scenario.expected.warningEvent) {
        const warning = events
          .slice(eventsBefore)
          .find((event) => event.eventType === scenario.expected.warningEvent);
        expect(warning).toBeDefined();
        if (scenario.expected.severity) {
          expect(warning?.payload?.severity).toBe(scenario.expected.severity);
        }
      }
    }
  });

  it("mqtt session fixture enforces tiered gateway action and fail-closed forwarding", async () => {
    const fixture = loadMqttGatewaySessionFixture();
    const gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
    });
    const token = issueAndStore({
      resource: fixture.token.resource,
      actions: [...fixture.token.actions],
    });

    const mqttClient: MqttClientAdapter & {
      publish: ReturnType<typeof vi.fn>;
      subscribe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    } = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    const session = new MqttGatewaySession({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      broker: fixture.broker,
      gateway,
      mqttClient,
    });

    for (const scenario of fixture.cases) {
      const resource = mqttTopicToResourceUri(fixture.broker, scenario.topic);
      const directDecision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource,
        action: scenario.mode,
        params:
          scenario.mode === "publish"
            ? { topic: scenario.topic, payload: scenario.payload ?? "" }
            : { topicPattern: scenario.topic },
      });

      expect(directDecision.assignedTier).toBe(scenario.expected.assignedTier);
      expect(directDecision.action).toBe(scenario.expected.gatewayAction);

      if (scenario.mode === "publish") {
        const before = mqttClient.publish.mock.calls.length;
        const op = session.authorizedPublish(
          scenario.topic,
          Buffer.from(scenario.payload ?? ""),
        );
        if (scenario.expected.forwarded) {
          const decision = await op;
          expect(decision.action).toBe("allow");
          expect(mqttClient.publish.mock.calls.length).toBe(before + 1);
        } else {
          await expect(op).rejects.toThrow(MqttAuthorizationError);
          expect(mqttClient.publish.mock.calls.length).toBe(before);
        }
      } else {
        const before = mqttClient.subscribe.mock.calls.length;
        const op = session.authorizedSubscribe(scenario.topic);
        if (scenario.expected.forwarded) {
          const decision = await op;
          expect(decision.action).toBe("allow");
          expect(mqttClient.subscribe.mock.calls.length).toBe(before + 1);
        } else {
          await expect(op).rejects.toThrow(MqttAuthorizationError);
          expect(mqttClient.subscribe.mock.calls.length).toBe(before);
        }
      }
    }
  });

  it("verifiable compute fixture enforces proof metadata on critical actions", async () => {
    const fixture = loadVerifiableComputeCriticalActionsFixture();
    const gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
    });
    const token = issueAndStore({
      resource: fixture.token.resource,
      actions: [...fixture.token.actions],
      verifiableComputeRequirements: fixture.token.verifiableComputeRequirements,
    });

    for (const scenario of fixture.cases) {
      const executionContextRaw = scenario.request.executionContext as
        | Record<string, unknown>
        | undefined;
      const executionContext = executionContextRaw
        ? JSON.parse(JSON.stringify(executionContextRaw).replace(
            /\"__NOW__\"/g,
            JSON.stringify(nowISO8601()),
          ))
        : undefined;

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: scenario.request.resource,
        action: scenario.request.action,
        params: scenario.request.params ?? {},
        executionContext: executionContext as SintRequest["executionContext"],
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
