/**
 * Canonical fixture-driven conformance checks.
 *
 * These tests make fixture files executable contracts for external interop
 * certification and internal multi-agent development alignment.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  SINT_TIER_COMPLIANCE_CROSSWALK,
  type SintCapabilityToken,
  type SintCapabilityTokenRequest,
  type SintRequest,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import {
  sparkplugActionForMessageType,
  sparkplugTopicToResourceUri,
} from "@pshkv/bridge-mqtt-sparkplug";
import {
  rmfDispatchResourceUri,
  rmfOperationToAction,
} from "@pshkv/bridge-open-rmf";
import { opcUaNodeToResourceUri, opcUaOperationToAction } from "@pshkv/bridge-opcua";
import {
  loadHardwareSafetyHandshakeFixture,
  loadOpcUaSafetyControlFixture,
  loadTierComplianceCrosswalkFixture,
  loadWellKnownDiscoveryFixture,
  loadWarehouseMoveEquivalenceFixture,
} from "./fixture-loader.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function replaceNowPlaceholder<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(
      /\"__NOW__\"/g,
      JSON.stringify(nowISO8601()),
    ),
  ) as T;
}

describe("Canonical Fixture Conformance", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let events: Array<{ eventType: string; payload: Record<string, unknown> }>;

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
    revocationStore.clear();
    events = [];
    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      revocationStore,
      emitLedgerEvent: (event) => {
        events.push({
          eventType: event.eventType,
          payload: event.payload,
        });
      },
    });
  });

  it("well-known discovery fixture preserves v0.2 boundary contract", () => {
    const fixture = loadWellKnownDiscoveryFixture();
    expect(fixture.name).toBe("SINT Protocol");
    expect(fixture.version).toBe("0.2.0");
    expect(fixture.boundary).toContain("governance and runtime enforcement");
    expect(fixture.identityMethods).toContain("ed25519");
    expect(fixture.openapi).toBe("/v1/openapi.json");
    expect(fixture.supportedBridges.length).toBeGreaterThan(0);
    expect(fixture.complianceCrosswalk?.path).toBe("/v1/compliance/tier-crosswalk");
  });

  it("tier compliance crosswalk fixture stays aligned with exported core mapping", () => {
    const fixture = loadTierComplianceCrosswalkFixture();
    expect(SINT_TIER_COMPLIANCE_CROSSWALK.length).toBe(fixture.tiers.length);

    for (const tierFixture of fixture.tiers) {
      const mapped = SINT_TIER_COMPLIANCE_CROSSWALK.find((entry) => entry.tier === tierFixture.tier);
      expect(mapped).toBeDefined();
      expect(mapped?.consequenceClass).toBe(tierFixture.consequenceClass);

      for (const requiredReference of tierFixture.requiredReferences) {
        expect(mapped?.mappings.some((m) => m.reference === requiredReference)).toBe(true);
      }
    }
  });

  it("warehouse move fixture yields equivalent escalation semantics across ROS2, Sparkplug, and Open-RMF", async () => {
    const fixture = loadWarehouseMoveEquivalenceFixture();

    const rosToken = issueAndStore({
      resource: fixture.tokens.ros2.resource,
      actions: [...fixture.tokens.ros2.actions],
    });
    const sparkToken = issueAndStore({
      resource: fixture.tokens.sparkplug.resource,
      actions: [...fixture.tokens.sparkplug.actions],
    });
    const rmfToken = issueAndStore({
      resource: fixture.tokens.openRmf.resource,
      actions: [...fixture.tokens.openRmf.actions],
    });

    const rosDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rosToken.tokenId,
      resource: fixture.requests.ros2.resource,
      action: fixture.requests.ros2.action,
      params: fixture.requests.ros2.params ?? {},
      physicalContext: fixture.requests.ros2.physicalContext,
      recentActions: fixture.requests.ros2.recentActions,
    });

    const sparkResource = sparkplugTopicToResourceUri(fixture.requests.sparkplug.topic);
    expect(sparkResource).toBe(fixture.requests.sparkplug.expectedResource);
    const sparkAction = sparkplugActionForMessageType(fixture.requests.sparkplug.messageType);
    expect(sparkAction).toBe(fixture.requests.sparkplug.expectedAction);

    const sparkDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: sparkToken.tokenId,
      resource: sparkResource!,
      action: sparkAction,
      params: fixture.requests.sparkplug.params ?? {},
      physicalContext: fixture.requests.sparkplug.physicalContext,
      recentActions: fixture.requests.sparkplug.recentActions,
    });

    const rmfResource = rmfDispatchResourceUri(fixture.requests.openRmf.fleetName);
    expect(rmfResource).toBe(fixture.requests.openRmf.expectedResource);
    const rmfAction = rmfOperationToAction(fixture.requests.openRmf.operation);
    expect(rmfAction).toBe(fixture.requests.openRmf.expectedAction);

    const rmfDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rmfToken.tokenId,
      resource: rmfResource,
      action: rmfAction,
      params: fixture.requests.openRmf.params ?? {},
      physicalContext: fixture.requests.openRmf.physicalContext,
      recentActions: fixture.requests.openRmf.recentActions,
    });

    for (const decision of [rosDecision, sparkDecision, rmfDecision]) {
      expect(decision.assignedTier).toBe(fixture.expected.assignedTier);
      expect(decision.action).toBe(fixture.expected.decisionAction);
    }
  });

  it("OPC UA safety fixture enforces read/write/critical-write tier behavior", async () => {
    const fixture = loadOpcUaSafetyControlFixture();
    const token = issueAndStore({
      resource: fixture.token.resource,
      actions: [...fixture.token.actions],
    });

    for (const scenario of fixture.cases) {
      const resource = opcUaNodeToResourceUri(scenario.nodeId, fixture.endpoint);
      const action = opcUaOperationToAction(scenario.operation);

      expect(resource).toBe(scenario.expectedResource);
      expect(action).toBe(scenario.expectedAction);

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource,
        action,
        params: { fixtureCase: scenario.name },
      });

      expect(decision.assignedTier).toBe(scenario.expected.assignedTier);
      expect(decision.action).toBe(scenario.expected.decisionAction);
    }
  });

  it("hardware safety handshake fixture enforces fail-closed industrial permit behavior", async () => {
    const fixture = loadHardwareSafetyHandshakeFixture();
    const token = issueAndStore({
      resource: fixture.token.resource,
      actions: [...fixture.token.actions],
    });

    for (const scenario of fixture.cases) {
      const eventsBefore = events.length;
      const executionContext = scenario.request.executionContext
        ? replaceNowPlaceholder(scenario.request.executionContext)
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
      if (scenario.expected.expectedEvidenceEvent) {
        const emitted = events
          .slice(eventsBefore)
          .some((event) => event.eventType === scenario.expected.expectedEvidenceEvent);
        expect(emitted).toBe(true);
      }
    }
  });
});
