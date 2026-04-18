/**
 * SwarmCoordinator tests — collective constraint enforcement.
 */

import { describe, it, expect } from "vitest";
import { SwarmCoordinator } from "../src/swarm-coordinator.js";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { ApprovalTier } from "@pshkv/core";
import type { SintCapabilityToken, SintRequest } from "@pshkv/core";

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const rootKP = generateKeypair();

function makeToken(agentPublicKey: string, resource = "ros2:///cmd_vel"): SintCapabilityToken {
  const result = issueCapabilityToken({
    issuer: rootKP.publicKey,
    subject: agentPublicKey,
    resource,
    actions: ["publish"],
    constraints: { maxVelocityMps: 5.0 },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: false,
  }, rootKP.privateKey);
  if (!result.ok) throw new Error("token issuance failed");
  return result.value;
}

function makeRequest(agentId: string, tokenId: string, velocityMps?: number): SintRequest {
  return {
    requestId: `req-${agentId}`,
    timestamp: new Date().toISOString(),
    agentId,
    tokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
    physicalContext: velocityMps !== undefined ? { currentVelocityMps: velocityMps } : undefined,
  };
}

function makeGateway(token: SintCapabilityToken): PolicyGateway {
  return new PolicyGateway({ resolveToken: () => token });
}

// Agents
const drone1 = generateKeypair();
const drone2 = generateKeypair();
const drone3 = generateKeypair();

describe("SwarmCoordinator", () => {
  it("single agent, no constraints violated → passes", async () => {
    const t1 = makeToken(drone1.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([["d1", makeGateway(t1)]]),
      swarmConstraints: { maxConcurrentActors: 2 },
    });
    coordinator.updateAgentState("d1", {
      token: t1, velocityMps: 0, massKg: 2.5,
      currentTier: ApprovalTier.T0_OBSERVE, csmlEscalated: false,
    });
    const req = makeRequest(drone1.publicKey, t1.tokenId);
    const { swarmCheck } = await coordinator.requestAction("d1", req);
    expect(swarmCheck.satisfied).toBe(true);
    expect(swarmCheck.violations).toHaveLength(0);
  });

  it("maxConcurrentActors: too many agents already acting → denied", async () => {
    const t1 = makeToken(drone1.publicKey);
    const t2 = makeToken(drone2.publicKey);
    const t3 = makeToken(drone3.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([
        ["d1", makeGateway(t1)],
        ["d2", makeGateway(t2)],
        ["d3", makeGateway(t3)],
      ]),
      swarmConstraints: { maxConcurrentActors: 2 },
    });
    // Two agents already in ACT tier
    coordinator.updateAgentState("d1", {
      token: t1, currentTier: ApprovalTier.T2_ACT, csmlEscalated: false,
    });
    coordinator.updateAgentState("d2", {
      token: t2, currentTier: ApprovalTier.T2_ACT, csmlEscalated: false,
    });
    coordinator.updateAgentState("d3", {
      token: t3, currentTier: ApprovalTier.T0_OBSERVE, csmlEscalated: false,
    });
    // d3 wants to act → would make 3/2 actors
    const req = makeRequest(drone3.publicKey, t3.tokenId, 2.0);
    const { decision, swarmCheck } = await coordinator.requestAction("d3", req);
    expect(swarmCheck.satisfied).toBe(false);
    expect(swarmCheck.violations.some((v) => v.includes("maxConcurrentActors"))).toBe(true);
    expect(decision.action).toBe("deny");
  });

  it("maxCollectiveKineticEnergyJ: adding new velocity would exceed limit → denied", async () => {
    const t1 = makeToken(drone1.publicKey);
    const t2 = makeToken(drone2.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([
        ["d1", makeGateway(t1)],
        ["d2", makeGateway(t2)],
      ]),
      swarmConstraints: { maxCollectiveKineticEnergyJ: 100 },
    });
    // d1 already moving at 4 m/s, mass 2.5 kg → KE = 20 J
    coordinator.updateAgentState("d1", {
      token: t1, velocityMps: 4.0, massKg: 2.5,
      currentTier: ApprovalTier.T2_ACT, csmlEscalated: false,
    });
    // d2 wants to go 10 m/s, mass 2.5 kg → KE = 125 J → total = 145 J > 100 J
    coordinator.updateAgentState("d2", {
      token: t2, velocityMps: 0, massKg: 2.5,
      currentTier: ApprovalTier.T0_OBSERVE, csmlEscalated: false,
    });
    const req = makeRequest(drone2.publicKey, t2.tokenId, 10.0);
    const { swarmCheck } = await coordinator.requestAction("d2", req);
    expect(swarmCheck.satisfied).toBe(false);
    expect(swarmCheck.violations.some((v) => v.includes("maxCollectiveKineticEnergyJ"))).toBe(true);
  });

  it("maxCollectiveKineticEnergyJ: stays within limit → passes swarm check", async () => {
    const t1 = makeToken(drone1.publicKey);
    const t2 = makeToken(drone2.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([
        ["d1", makeGateway(t1)],
        ["d2", makeGateway(t2)],
      ]),
      swarmConstraints: { maxCollectiveKineticEnergyJ: 500 },
    });
    coordinator.updateAgentState("d1", {
      token: t1, velocityMps: 2.0, massKg: 2.5,
      currentTier: ApprovalTier.T2_ACT, csmlEscalated: false,
    });
    coordinator.updateAgentState("d2", {
      token: t2, velocityMps: 0, massKg: 2.5,
      currentTier: ApprovalTier.T0_OBSERVE, csmlEscalated: false,
    });
    // d2 goes 3 m/s: d1 KE=5J + d2 KE=11.25J = 16.25J < 500J
    const req = makeRequest(drone2.publicKey, t2.tokenId, 3.0);
    const { swarmCheck } = await coordinator.requestAction("d2", req);
    expect(swarmCheck.satisfied).toBe(true);
  });

  it("minInterAgentDistanceM: agents too close → denied", async () => {
    const t1 = makeToken(drone1.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([["d1", makeGateway(t1)]]),
      swarmConstraints: { minInterAgentDistanceM: 5.0 },
    });
    // Two agents 3m apart
    coordinator.updateAgentState("d1", {
      token: t1, currentTier: ApprovalTier.T0_OBSERVE, csmlEscalated: false,
      position: { north: 0, east: 0, down: 0 },
    });
    coordinator.updateAgentState("d2-phantom", {
      token: t1, currentTier: ApprovalTier.T0_OBSERVE, csmlEscalated: false,
      position: { north: 2, east: 2, down: 0 }, // ~2.83m away
    });
    const req = makeRequest(drone1.publicKey, t1.tokenId);
    const { swarmCheck } = await coordinator.requestAction("d1", req);
    expect(swarmCheck.satisfied).toBe(false);
    expect(swarmCheck.violations.some((v) => v.includes("minInterAgentDistanceM"))).toBe(true);
  });

  it("maxEscalatedFraction: too many CSML-escalated agents → denied", async () => {
    const t1 = makeToken(drone1.publicKey);
    const t2 = makeToken(drone2.publicKey);
    const t3 = makeToken(drone3.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([
        ["d1", makeGateway(t1)],
        ["d2", makeGateway(t2)],
        ["d3", makeGateway(t3)],
      ]),
      swarmConstraints: { maxEscalatedFraction: 0.2 },
    });
    // 2/3 agents are CSML-escalated = 66% > 20%
    coordinator.updateAgentState("d1", {
      token: t1, currentTier: ApprovalTier.T2_ACT, csmlEscalated: true,
    });
    coordinator.updateAgentState("d2", {
      token: t2, currentTier: ApprovalTier.T1_PREPARE, csmlEscalated: true,
    });
    coordinator.updateAgentState("d3", {
      token: t3, currentTier: ApprovalTier.T0_OBSERVE, csmlEscalated: false,
    });
    const req = makeRequest(drone3.publicKey, t3.tokenId);
    const { swarmCheck } = await coordinator.requestAction("d3", req);
    expect(swarmCheck.satisfied).toBe(false);
    expect(swarmCheck.violations.some((v) => v.includes("maxEscalatedFraction"))).toBe(true);
  });

  it("swarmMetrics are returned even when constraints pass", async () => {
    const t1 = makeToken(drone1.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([["d1", makeGateway(t1)]]),
      swarmConstraints: {},
    });
    coordinator.updateAgentState("d1", {
      token: t1, velocityMps: 2.0, massKg: 3.0,
      currentTier: ApprovalTier.T2_ACT, csmlEscalated: false,
    });
    const req = makeRequest(drone1.publicKey, t1.tokenId, 2.0);
    const { swarmCheck } = await coordinator.requestAction("d1", req);
    expect(swarmCheck.swarmMetrics.activeAgentCount).toBe(1);
    expect(swarmCheck.swarmMetrics.actingAgentCount).toBe(1);
    expect(swarmCheck.swarmMetrics.collectiveKineticEnergyJ).toBeCloseTo(6.0); // 0.5 * 3 * 4
  });

  it("unregistered agent → denied immediately", async () => {
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map(),
      swarmConstraints: {},
    });
    const fakeToken = makeToken(drone1.publicKey);
    const req = makeRequest(drone1.publicKey, "fake-token-id");
    const { decision } = await coordinator.requestAction("unknown-agent", req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("AGENT_NOT_REGISTERED");
  });

  it("size returns number of registered gateways", () => {
    const t1 = makeToken(drone1.publicKey);
    const coordinator = new SwarmCoordinator({
      agentGateways: new Map([["d1", makeGateway(t1)]]),
      swarmConstraints: {},
    });
    expect(coordinator.size).toBe(1);
  });
});
