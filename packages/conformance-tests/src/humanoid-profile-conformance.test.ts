/**
 * Humanoid robotics profile conformance.
 *
 * Locks the first vendor-neutral humanoid profile to existing SINT bridge
 * semantics before any proprietary Arc/Helix/BrainNet adapters are added.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  ApprovalTier,
  type SintCapabilityToken,
  type SintCapabilityTokenRequest,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import {
  actionToResourceUri,
  serviceToResourceUri,
  topicToResourceUri,
} from "@pshkv/bridge-ros2";
import {
  defaultTierForRmfOperation,
  rmfDispatchResourceUri,
  rmfOperationToAction,
  rmfRobotResourceUri,
} from "@pshkv/bridge-open-rmf";
import { loadHumanoidProfileFixture } from "./fixture-loader.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function expectedDecisionForTier(tier: ApprovalTier): "allow" | "escalate" {
  return tier === ApprovalTier.T0_OBSERVE || tier === ApprovalTier.T1_PREPARE
    ? "allow"
    : "escalate";
}

describe("Humanoid profile fixture v1", () => {
  const fixture = loadHumanoidProfileFixture();
  const root = generateKeypair();
  const agent = generateKeypair();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let emitted: Array<{ eventType: string; payload: Record<string, unknown> }>;

  function issueAndStore(
    overrides: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "humanoid://*",
      actions: ["observe", "prepare", "publish", "call", "override"],
      constraints: {
        maxForceNewtons: 80,
        maxVelocityMps: 1.2,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) {
      throw new Error(`Token issuance failed: ${result.error}`);
    }
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    emitted = [];
    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      emitLedgerEvent: (event) => {
        emitted.push({ eventType: event.eventType, payload: event.payload });
      },
    });
  });

  it("declares the humanoid integration contract", () => {
    expect(fixture.fixtureId).toBe("humanoid-profile-v1");
    expect(fixture.resourcePrefix).toBe("humanoid://fleet/warehouse/robot/digit-07");
    expect(fixture.requirements).toEqual({
      singleGatewayChokePoint: true,
      ros2OpenRmfEquivalentTiering: true,
      handoffRequiresReceipt: true,
      estopIsT3Override: true,
    });
    expect(fixture.intents.map((intent) => intent.name)).toEqual([
      "observe_status",
      "stage_grasp_plan",
      "navigate_base",
      "move_arm",
      "handoff_to_amr",
      "enter_novel_workspace",
      "emergency_stop",
    ]);
  });

  it("enforces canonical humanoid resources through PolicyGateway.intercept", async () => {
    for (const intent of fixture.intents) {
      const token = issueAndStore({
        resource: "humanoid://*",
        actions: [intent.humanoidAction],
      });

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: intent.humanoidResource,
        action: intent.humanoidAction,
        params: {
          intent: intent.name,
          profile: fixture.fixtureId,
        },
        physicalContext: intent.physicalContext,
      });

      expect(decision.assignedTier, intent.name).toBe(intent.expectedTier);
      expect(decision.action, intent.name).toBe(intent.expectedDecisionAction);
    }

    expect(
      emitted.filter((event) => event.eventType === "policy.evaluated").length,
    ).toBeGreaterThanOrEqual(fixture.intents.length);
  });

  it("keeps ROS2 and Open-RMF mappings equivalent to humanoid intents", async () => {
    for (const intent of fixture.intents) {
      const mappings = intent.bridgeMappings;
      if (!mappings) continue;

      if (mappings.ros2) {
        const token = issueAndStore({
          resource: "ros2://*",
          actions: [mappings.ros2.action],
        });
        const resource =
          mappings.ros2.kind === "topic"
            ? topicToResourceUri(mappings.ros2.name)
            : mappings.ros2.kind === "service"
              ? serviceToResourceUri(mappings.ros2.name)
              : actionToResourceUri(mappings.ros2.name);

        const decision = await gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource,
          action: mappings.ros2.action,
          params: { intent: intent.name },
          physicalContext: intent.physicalContext,
        });

        expect(decision.assignedTier, `${intent.name}:ros2`).toBe(
          mappings.ros2.expectedTier,
        );
        expect(decision.action, `${intent.name}:ros2`).toBe(
          expectedDecisionForTier(mappings.ros2.expectedTier),
        );
      }

      if (mappings.openRmf) {
        const token = issueAndStore({
          resource: "open-rmf://*",
          actions: [mappings.openRmf.expectedAction],
        });
        const resource = mappings.openRmf.robotName
          ? rmfRobotResourceUri(mappings.openRmf.fleetName, mappings.openRmf.robotName)
          : rmfDispatchResourceUri(mappings.openRmf.fleetName);
        const action = rmfOperationToAction(mappings.openRmf.operation);

        expect(action).toBe(mappings.openRmf.expectedAction);
        expect(defaultTierForRmfOperation(mappings.openRmf.operation)).toBe(
          mappings.openRmf.expectedTier,
        );

        const decision = await gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource,
          action,
          params: { intent: intent.name },
          physicalContext: intent.physicalContext,
        });

        expect(decision.assignedTier, `${intent.name}:open-rmf`).toBe(
          mappings.openRmf.expectedTier,
        );
        expect(decision.action, `${intent.name}:open-rmf`).toBe(
          expectedDecisionForTier(mappings.openRmf.expectedTier),
        );
      }
    }
  });

  it("requires handoff intents to declare auditable receipt semantics", () => {
    const handoff = fixture.intents.find((intent) => intent.name === "handoff_to_amr");
    expect(handoff?.requiresReceipt).toBe(true);
    expect(handoff?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(handoff?.bridgeMappings?.openRmf?.operation).toBe("task.dispatch");
  });
});
