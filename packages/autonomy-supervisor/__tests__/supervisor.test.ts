import { describe, expect, it, vi } from "vitest";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import {
  AutonomyState,
  GuardRegistry,
  PolicyGatewayAutonomySupervisor,
  defaultPermissiveGuardProvider,
  evaluateAutonomy,
  outputAllowed,
  validateAutonomyPolicy,
  type GuardState,
  type SupervisorPort,
} from "../src/index.js";

const cleanGuard: GuardState = {
  invalid: false,
  unsafeUnrecoverable: false,
  disagree: false,
  assistAvailable: false,
  timeoutM: false,
  timeoutA: false,
  extAuth: false,
};

function guard(overrides: Partial<GuardState>): GuardState {
  return { ...cleanGuard, ...overrides };
}

function portFor(initial: AutonomyState, calls: string[] = []): SupervisorPort {
  let state = initial;
  return {
    getState: () => state,
    ledger: () => calls.push("ledger"),
    setState: (_agentId, nextState) => {
      calls.push("setState");
      state = nextState;
    },
  };
}

describe("AutonomySupervisor state machine", () => {
  it.each([
    ["t_SM", AutonomyState.STABLE, guard({ invalid: true }), AutonomyState.METACOGNITIVE],
    ["t_SR", AutonomyState.STABLE, guard({ unsafeUnrecoverable: true }), AutonomyState.REGULATED],
    ["t_MS", AutonomyState.METACOGNITIVE, cleanGuard, AutonomyState.STABLE],
    ["t_MA", AutonomyState.METACOGNITIVE, guard({ invalid: true, timeoutM: true, assistAvailable: true }), AutonomyState.ASSISTED],
    ["t_MR", AutonomyState.METACOGNITIVE, guard({ invalid: true, timeoutM: true }), AutonomyState.REGULATED],
    ["t_AS", AutonomyState.ASSISTED, cleanGuard, AutonomyState.STABLE],
    ["t_AR", AutonomyState.ASSISTED, guard({ invalid: true, timeoutA: true }), AutonomyState.REGULATED],
    ["t_RS", AutonomyState.REGULATED, guard({ extAuth: true }), AutonomyState.STABLE],
  ] as const)("fires %s under its verified guard", (name, from, g, to) => {
    const evaluation = evaluateAutonomy("agent", "request", g, portFor(from));
    expect(evaluation.firedTransition).toBe(name);
    expect(evaluation.nextState).toBe(to);
  });

  it("does not transition when the current state's guards are false", () => {
    const evaluation = evaluateAutonomy(
      "agent",
      "request",
      cleanGuard,
      portFor(AutonomyState.STABLE),
    );
    expect(evaluation.firedTransition).toBeNull();
    expect(evaluation.nextState).toBe(AutonomyState.STABLE);
  });

  it("prioritizes governance over escalation and recovery", () => {
    const evaluation = evaluateAutonomy(
      "agent",
      "request",
      guard({ invalid: true, unsafeUnrecoverable: true, timeoutM: true, assistAvailable: true }),
      portFor(AutonomyState.METACOGNITIVE),
    );
    expect(evaluation.firedTransition).toBe("t_MR");
    expect(evaluation.nextState).toBe(AutonomyState.REGULATED);
  });

  it("permits output only from stable with clean guards", () => {
    expect(outputAllowed(AutonomyState.STABLE, cleanGuard)).toBe(true);
    expect(outputAllowed(AutonomyState.STABLE, guard({ invalid: true }))).toBe(false);
    expect(outputAllowed(AutonomyState.METACOGNITIVE, cleanGuard)).toBe(false);
    expect(outputAllowed(AutonomyState.ASSISTED, cleanGuard)).toBe(false);
    expect(outputAllowed(AutonomyState.REGULATED, cleanGuard)).toBe(false);
  });

  it("appends the ledger event before mutating state", () => {
    const calls: string[] = [];
    evaluateAutonomy(
      "agent",
      "request",
      guard({ invalid: true }),
      portFor(AutonomyState.STABLE, calls),
    );
    expect(calls).toEqual(["ledger", "setState"]);
  });

  it("rejects policy_gateway as a regulated controller", () => {
    expect(validateAutonomyPolicy({
      requiredState: "stable",
      guardProfileId: "mcp",
      regulatedController: "policy_gateway",
      failClosed: true,
    }).ok).toBe(false);
  });

  it("rejects failClosed=false", () => {
    expect(validateAutonomyPolicy({
      requiredState: "stable",
      guardProfileId: "mcp",
      regulatedController: "human_operator",
      failClosed: false,
    }).ok).toBe(false);
  });

  it("only external authorization restores regulated control", async () => {
    const request = {
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: "2026-05-28T10:00:00.000000Z",
      agentId: "a".repeat(64),
      tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a8",
      resource: "mcp://filesystem/readFile",
      action: "call",
      params: {},
    };
    const token = {
      tokenId: request.tokenId,
      issuer: "b".repeat(64),
      subject: request.agentId,
      resource: request.resource,
      actions: ["call"],
      constraints: {},
      autonomyPolicy: {
        requiredState: "stable",
        guardProfileId: "default-permissive",
        regulatedController: "human_operator",
        failClosed: true,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      issuedAt: "2026-05-28T09:00:00.000000Z",
      expiresAt: "2026-05-28T11:00:00.000000Z",
      revocable: true,
      signature: "c".repeat(128),
    };
    const registry = new GuardRegistry([defaultPermissiveGuardProvider]);
    const plugin = new PolicyGatewayAutonomySupervisor({
      ledgerWriter: new LedgerWriter(),
      registry,
      getExternalAuthorization: vi.fn(() => ({
        authorized: true,
        source: "policy_gateway",
      })),
    });
    plugin.setState(request.agentId, AutonomyState.REGULATED);

    const denied = await plugin.preIntercept(request, token);
    expect(denied?.action).toBe("deny");
    expect(plugin.getState(request.agentId)).toBe(AutonomyState.REGULATED);

    const restored = new PolicyGatewayAutonomySupervisor({
      ledgerWriter: new LedgerWriter(),
      registry,
      getExternalAuthorization: () => ({
        authorized: true,
        source: "human_operator",
      }),
    });
    restored.setState(request.agentId, AutonomyState.REGULATED);
    await expect(restored.preIntercept(request, token)).resolves.toBeUndefined();
    expect(restored.getState(request.agentId)).toBe(AutonomyState.STABLE);
  });
});
