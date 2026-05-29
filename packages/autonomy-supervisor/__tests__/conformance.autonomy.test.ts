import { describe, expect, it } from "vitest";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import {
  ApprovalTier,
  type SintCapabilityToken,
  type SintCapabilityTokenRequest,
  type SintRequest,
} from "@pshkv/core";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import {
  AutonomyState,
  PolicyGatewayAutonomySupervisor,
  type AutonomyRuntimeSignals,
  type ExternalAuthorizationSignal,
} from "../src/index.js";

function futureISO(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

type Harness = {
  readonly gateway: PolicyGateway;
  readonly plugin: PolicyGatewayAutonomySupervisor;
  readonly ledger: LedgerWriter;
  readonly token: SintCapabilityToken;
  readonly agentId: string;
  setRuntime(runtime: AutonomyRuntimeSignals): void;
  setExternalAuthorization(signal: ExternalAuthorizationSignal | undefined): void;
  request(overrides?: Partial<SintRequest>): SintRequest;
};

function makeHarness(options: {
  readonly resource?: string;
  readonly action?: string;
  readonly autonomyPolicy?: SintCapabilityTokenRequest["autonomyPolicy"];
} = {}): Harness {
  const issuer = generateKeypair();
  const agent = generateKeypair();
  const resource = options.resource ?? "mcp://filesystem/writeFile";
  const action = options.action ?? "call";
  const issued = issueCapabilityToken({
    issuer: issuer.publicKey,
    subject: agent.publicKey,
    resource,
    actions: [action],
    constraints: {},
    autonomyPolicy: options.autonomyPolicy ?? {
      requiredState: "stable",
      guardProfileId: "mcp",
      maxMetacognitiveRecoveryMs: 100,
      maxAssistedRecoveryMs: 100,
      assistanceQuorum: { required: 1, verifierTypes: ["verifier-agent"] },
      regulatedController: "human_operator",
      failClosed: true,
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(1),
    revocable: true,
  }, issuer.privateKey);
  if (!issued.ok) {
    throw new Error(`token issue failed: ${issued.error}`);
  }

  let runtime: AutonomyRuntimeSignals = {};
  let externalAuthorization: ExternalAuthorizationSignal | undefined;
  const tokenStore = new Map([[issued.value.tokenId, issued.value]]);
  const ledger = new LedgerWriter();
  const plugin = new PolicyGatewayAutonomySupervisor({
    ledgerWriter: ledger,
    getCsmlScore: () => 0,
    getRuntimeSignals: () => runtime,
    getExternalAuthorization: () => externalAuthorization,
  });
  const gateway = new PolicyGateway({
    resolveToken: (tokenId) => tokenStore.get(tokenId),
    autonomySupervisor: plugin,
    emitLedgerEvent: (event) => {
      ledger.append({
        eventType: event.eventType,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
    },
  });

  return {
    gateway,
    plugin,
    ledger,
    token: issued.value,
    agentId: agent.publicKey,
    setRuntime(nextRuntime) {
      runtime = nextRuntime;
    },
    setExternalAuthorization(signal) {
      externalAuthorization = signal;
    },
    request(overrides = {}) {
      return {
        requestId: generateUUIDv7(),
        timestamp: futureISO(0),
        agentId: agent.publicKey,
        tokenId: issued.value.tokenId,
        resource,
        action,
        params: {},
        ...overrides,
      };
    },
  };
}

describe("Managed-autonomy conformance", () => {
  it("stable_allows_when_policy_passes", async () => {
    const h = makeHarness();
    const decision = await h.gateway.intercept(h.request());
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("metacognitive_blocks_external_tool_calls", async () => {
    const h = makeHarness();
    h.plugin.setState(h.agentId, AutonomyState.METACOGNITIVE);
    h.setRuntime({ signals: { schemaInvalidArgs: true } });
    const decision = await h.gateway.intercept(h.request());
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("AUTONOMY_OUTPUT_SUPPRESSED");
  });

  it("assisted_blocks_unilateral_action", async () => {
    const h = makeHarness();
    h.plugin.setState(h.agentId, AutonomyState.ASSISTED);
    h.setRuntime({ signals: { verifierAgentRejection: true } });
    const decision = await h.gateway.intercept(h.request());
    expect(decision.action).not.toBe("allow");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.ASSISTED);
  });

  it("regulated_control_revokes_authority", async () => {
    const h = makeHarness();
    h.plugin.setState(h.agentId, AutonomyState.REGULATED);
    const decision = await h.gateway.intercept(h.request());
    expect(decision.action).toBe("deny");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.REGULATED);
  });

  it("invalid_guard_moves_stable_to_recovery", async () => {
    const h = makeHarness();
    h.setRuntime({ signals: { retrievalDivergence: true } });
    const decision = await h.gateway.intercept(h.request());
    expect(decision.action).toBe("deny");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.METACOGNITIVE);
  });

  it("recovery_timeout_forces_assisted_or_regulated", async () => {
    const assisted = makeHarness();
    assisted.plugin.setState(assisted.agentId, AutonomyState.METACOGNITIVE);
    assisted.setRuntime({
      assistAvailable: true,
      signals: { retrievalDivergence: true, timeoutM: true },
    });
    const assistedDecision = await assisted.gateway.intercept(assisted.request());
    expect(assistedDecision.action).toBe("escalate");
    expect(assisted.plugin.getState(assisted.agentId)).toBe(AutonomyState.ASSISTED);

    const regulated = makeHarness({
      autonomyPolicy: {
        requiredState: "stable",
        guardProfileId: "mcp",
        maxMetacognitiveRecoveryMs: 100,
        maxAssistedRecoveryMs: 100,
        regulatedController: "human_operator",
        failClosed: true,
      },
    });
    regulated.plugin.setState(regulated.agentId, AutonomyState.METACOGNITIVE);
    regulated.setRuntime({ signals: { retrievalDivergence: true, timeoutM: true } });
    const regulatedDecision = await regulated.gateway.intercept(regulated.request());
    expect(regulatedDecision.action).toBe("deny");
    expect(regulated.plugin.getState(regulated.agentId)).toBe(AutonomyState.REGULATED);
  });

  it("assistance_disagreement_forces_regulated_control", async () => {
    const h = makeHarness();
    h.plugin.setState(h.agentId, AutonomyState.ASSISTED);
    h.setRuntime({ signals: { verifierAgentRejection: true, timeoutA: true } });
    const decision = await h.gateway.intercept(h.request());
    expect(decision.action).toBe("deny");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.REGULATED);
  });

  it("stable_restoration_requires_evidence", async () => {
    const h = makeHarness();
    h.plugin.setState(h.agentId, AutonomyState.REGULATED);
    const blocked = await h.gateway.intercept(h.request());
    expect(blocked.action).toBe("deny");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.REGULATED);

    h.setExternalAuthorization({ authorized: true, source: "human_operator" });
    const restored = await h.gateway.intercept(h.request());
    expect(restored.action).toBe("allow");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.STABLE);
  });

  it("autonomy_transition_is_ledgered", async () => {
    const h = makeHarness();
    h.setRuntime({ signals: { schemaInvalidArgs: true } });
    const decision = await h.gateway.intercept(h.request());
    const events = h.ledger.getAll();
    expect(decision.action).toBe("deny");
    expect(events[0]?.eventType).toBe("autonomy.guard.triggered");
    expect(events.some((event) => event.eventType === "autonomy.state.entered")).toBe(true);
    expect(events.findIndex((event) => event.eventType === "autonomy.output.suppressed"))
      .toBeLessThan(events.findIndex((event) => event.eventType === "policy.evaluated"));
  });

  it("estop_overrides_all_autonomy_states", async () => {
    for (const state of [
      AutonomyState.STABLE,
      AutonomyState.METACOGNITIVE,
      AutonomyState.ASSISTED,
      AutonomyState.REGULATED,
    ]) {
      const h = makeHarness();
      h.plugin.setState(h.agentId, state);
      const decision = await h.gateway.intercept(h.request({
        executionContext: {
          hardwareSafety: {
            estopState: "triggered",
            observedAt: futureISO(0),
            controllerId: "safety-plc-1",
          },
        },
      }));
      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
    }
  });

  it("capability_token_cannot_override_suspension", async () => {
    for (const state of [
      AutonomyState.METACOGNITIVE,
      AutonomyState.ASSISTED,
      AutonomyState.REGULATED,
    ]) {
      const h = makeHarness({
        resource: "mcp://filesystem/readFile",
        action: "call",
      });
      h.plugin.setState(h.agentId, state);
      h.setRuntime({ signals: { schemaInvalidArgs: true, verifierAgentRejection: true } });
      const decision = await h.gateway.intercept(h.request());
      expect(decision.action).not.toBe("allow");
    }
  });

  it("approval_cannot_override_regulated_without_external_authorization", async () => {
    const h = makeHarness();
    h.plugin.setState(h.agentId, AutonomyState.REGULATED);
    h.setRuntime({ signals: { operatorApproval: true } });
    const blocked = await h.gateway.intercept(h.request());
    expect(blocked.action).toBe("deny");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.REGULATED);

    h.setExternalAuthorization({
      authorized: true,
      source: "hardware_safety_controller",
    });
    const restored = await h.gateway.intercept(h.request());
    expect(restored.action).toBe("allow");
    expect(h.plugin.getState(h.agentId)).toBe(AutonomyState.STABLE);
  });
});
