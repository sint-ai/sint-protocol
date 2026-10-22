/** Fault injection through the actual gateway; fixtures are executable inputs. */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalTier, RiskTier, SINT_EVENTS, type SintRequest, type SintCapabilityTokenRequest } from "@pshkv/core";
import { generateKeypair, generateUUIDv7, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { createSintMiddleware } from "@pshkv/bridge-mcp";
import { PolicyGateway, InMemoryCircuitBreaker, type PolicyGatewayConfig } from "@pshkv/gate-policy-gateway";
const fixture: { faults: string[]; seats: { seat: string; tiers: number[]; faults?: string[] }[] } = JSON.parse(readFileSync(new URL("../fixtures/security/policy-plugin-failures.v1.json", import.meta.url), "utf8"));
const root = generateKeypair();
const resources = ["mcp://filesystem/readFile", "mcp://filesystem/writeFile", "mcp://filesystem/deleteFile", "mcp://exec/run"];
const tiers = [ApprovalTier.T0_OBSERVE, ApprovalTier.T1_PREPARE, ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT];
const healthyBreaker = () => ({ getState: async () => "CLOSED" as const, recordSuccess: async () => "CLOSED" as const, recordDenial: async () => "CLOSED" as const, trip: async () => {}, reset: async () => {} });
function fault(kind: string): (...args: unknown[]) => any {
  if (kind === "throw") return () => { throw new Error("SECRET_ACCESS_TOKEN=do-not-log-this"); };
  if (kind === "reject") return () => Promise.reject(new Error("SECRET_ACCESS_TOKEN=do-not-log-this"));
  if (kind === "timeout") return () => new Promise(() => {});
  if (kind === "error_result") return () => ({ ok: false, error: "SECRET_ACCESS_TOKEN=do-not-log-this" });
  return () => ({ unexpected: true });
}
function setup(tier = 0, override: Partial<PolicyGatewayConfig> = {}, tokenExtra: Partial<SintCapabilityTokenRequest> = {}, requestExtra: Partial<SintRequest> = {}) {
  const issued = issueCapabilityToken({
    issuer: root.publicKey, subject: root.publicKey, resource: "mcp://*", actions: ["call", "exec.run"],
    constraints: {}, delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), revocable: true, ...tokenExtra,
  }, root.privateKey);
  if (!issued.ok) throw new Error(issued.error);
  const token = issued.value;
  const events: any[] = [];
  const config: PolicyGatewayConfig = { resolveToken: () => token, emitLedgerEvent: event => { events.push(event); }, pluginTimeoutMs: 20, ...override };
  const gateway = new PolicyGateway(config);
  const request: SintRequest = { requestId: generateUUIDv7(), timestamp: new Date().toISOString(), agentId: root.publicKey, tokenId: token.tokenId, resource: resources[tier]!, action: "call", params: {}, ...requestExtra };
  return { gateway, request, events, config, token };
}
function inject(seat: string, kind: string) {
  const broken = fault(kind);
  let config: Partial<PolicyGatewayConfig> = {};
  let token: Partial<SintCapabilityTokenRequest> = {};
  let request: Partial<SintRequest> = {};
  switch (seat) {
    case "token.resolve": config = { resolveToken: broken }; break;
    case "agentTrust.get": config = { getAgentTrustLevel: broken }; break;
    case "verifiableCompute.verify":
      config = { verifiableCompute: { verify: broken } };
      token = { verifiableComputeRequirements: { allowedProofTypes: ["snark"] } };
      request = { executionContext: { verifiableCompute: { proofType: "snark", proofRef: "proof://fixture", proofHash: "a".repeat(64) } } }; break;
    case "goalHijack.analyze": config = { goalHijackDetector: { analyze: broken } }; break;
    case "memoryIntegrity.check": config = { memoryIntegrity: { check: broken } }; break;
    case "circuitBreaker.getState": config = { circuitBreaker: { ...healthyBreaker(), getState: broken } }; break;
    case "circuitBreaker.recordSuccess": config = { circuitBreaker: { ...healthyBreaker(), recordSuccess: broken } }; break;
    case "circuitBreaker.recordDenial":
      config = { circuitBreaker: { ...healthyBreaker(), recordDenial: broken }, rateLimitStore: { increment: async () => 2 } };
      token = { constraints: { rateLimit: { maxCalls: 1, windowMs: 60_000 } } }; break;
    case "rateLimit.increment": config = { rateLimitStore: { increment: broken } }; token = { constraints: { rateLimit: { maxCalls: 10, windowMs: 60_000 } } }; break;
    case "economy.preIntercept": config = { economyPlugin: { preIntercept: broken, postIntercept: async () => {} } }; break;
    case "economy.postIntercept": config = { economyPlugin: { preIntercept: async () => undefined, postIntercept: broken } }; break;
    case "supplyChain.verify": config = { supplyChainVerifier: { verify: broken } }; break;
    case "csml.evaluateAgent": config = { csmlEscalation: { evaluateAgent: broken } }; break;
    case "circuitBreaker.trip": config = { circuitBreaker: { ...healthyBreaker(), trip: broken }, csmlEscalation: { evaluateAgent: async () => ({ escalated: true, resultTier: ApprovalTier.T3_COMMIT, csmlScore: 1, reason: "anomalous persona" }) } }; break;
    case "safetyPermit.resolve": config = { safetyPermit: { resolvePermit: broken } }; break;
    case "argInjection.analyze": config = { argInjectionDetector: { analyze: broken } }; break;
    case "dynamicEnvelope.compute": config = { dynamicEnvelope: { computeEnvelope: broken } }; break;
    case "humanAuthority.evaluate": config = { humanAuthorityPolicy: { evaluate: broken } }; break;
    case "spatialIntegrity.evaluate": config = { spatialIntegrityPolicy: { evaluate: broken } }; break;
    case "codeAsPolicy.verify": config = { codeAsPolicyGuard: { verify: broken } }; break;
    case "regulatedData.evaluate": config = { regulatedDataPolicy: { evaluate: broken } }; break;
    case "autonomy.preIntercept": config = { autonomySupervisor: { preIntercept: broken } }; break;
    case "spatialCorridor.verify":
      config = { spatialCorridorVerifier: { verifyCorridor: broken } };
      token = { executionEnvelope: { requiresSpatialProof: true } };
      request = { physicalContext: { currentPosition: { x: 0, y: 0, z: 0 } } }; break;
    case "edge.checkCentralEscalation": config = { edgeControlPlane: { checkCentralEscalation: broken } }; break;
    default: throw new Error(`Unimplemented fixture seat: ${seat}`);
  }
  return { config, token, request };
}
afterEach(() => vi.useRealTimers());

describe("configured enforcement fails closed with correlated evidence", () => {
  for (const { seat, tiers: tierCases, faults } of fixture.seats) {
    for (const tier of tierCases) {
      for (const kind of faults ?? fixture.faults) {
        it(`${seat}: T${tier} ${kind}`, async () => {
          const input = inject(seat, kind);
          const { gateway, request, events } = setup(tier, input.config, input.token, input.request);
          const decision = await gateway.intercept(request);
          expect(decision.action).toBe("deny");
          const failures = decision.transformations?.additionalAuditFields?.["pluginFailures"] as any[];
          expect(failures, JSON.stringify(decision)).toContainEqual(expect.objectContaining({ requestId: request.requestId, seat, policy: "deny", kind: kind === "throw" || kind === "reject" ? "exception" : kind === "malformed" ? "invalid_result" : kind }));
          expect(events.filter(event => event.eventType === "policy.plugin.failed")).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ requestId: request.requestId, seat, decision: "deny" }) }));
          const evaluations = events.filter(event => event.eventType === "policy.evaluated");
          expect(evaluations).toHaveLength(1);
          if (seat === "economy.postIntercept") {
            expect(evaluations[0].payload).toMatchObject({ requestId: request.requestId, decision: "allow", authorizationPendingPostChecks: true });
            expect(events.filter(event => event.eventType === "policy.decision.corrected")).toEqual([
              expect.objectContaining({ payload: expect.objectContaining({ requestId: request.requestId, previousDecision: "allow", decision: "deny", pluginFailures: failures }) }),
            ]);
          } else expect(evaluations[0].payload).toMatchObject({ requestId: request.requestId, decision: "deny", pluginFailures: failures });
          expect(JSON.stringify({ decision, events })).not.toContain("SECRET_ACCESS_TOKEN");
          if (seat === "circuitBreaker.recordDenial") expect(decision.denial?.policyViolated).toBe("RATE_LIMIT_EXCEEDED");
        });
      }
    }
  }
});

describe("advisory opt-in is bounded by seat and consequence", () => {
  for (const seat of ["goalHijack.analyze", "memoryIntegrity.check", "csml.evaluateAgent", "argInjection.analyze"] as const) {
    it.each([0, 1, 2, 3].flatMap(tier => fixture.faults.map(kind => [tier, kind] as const)))(`${seat} advisory T%s %s`, async (tier, kind) => {
      const input = inject(seat, kind);
      const { gateway, request, events } = setup(tier, { ...input.config, pluginFailurePolicies: { [seat]: "advisory" } });
      const decision = await gateway.intercept(request);
      expect(decision.action).toBe(tier < 2 ? "allow" : "deny");
      expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(expect.objectContaining({ seat, policy: tier < 2 ? "advisory" : "deny" }));
      expect(events.some(event => event.eventType === "policy.plugin.failed")).toBe(true);
    });
  }
  it("cannot make an authoritative circuit breaker advisory through runtime config", async () => {
    const { gateway, request } = setup(0, { ...inject("circuitBreaker.getState", "throw").config, pluginFailurePolicies: { "circuitBreaker.getState": "advisory" } as any });
    expect((await gateway.intercept(request)).action).toBe("deny");
  });
  it("retains an advisory failure when a later policy denies with existing audit fields", async () => {
    const context = setup(0, {
      ...inject("goalHijack.analyze", "throw").config, pluginFailurePolicies: { "goalHijack.analyze": "advisory" },
      economyPlugin: { preIntercept: async request => ({ requestId: request.requestId, timestamp: request.timestamp, action: "deny", assignedTier: ApprovalTier.T0_OBSERVE, assignedRisk: RiskTier.T0_READ, denial: { reason: "budget exhausted", policyViolated: "BUDGET_EXHAUSTED" }, transformations: { additionalAuditFields: { existing: "preserved" } } }), postIntercept: async () => {} },
    });
    const decision = await context.gateway.intercept(context.request);
    expect(decision.denial?.policyViolated).toBe("BUDGET_EXHAUSTED");
    expect(decision.transformations?.additionalAuditFields).toMatchObject({ existing: "preserved", pluginFailures: [expect.objectContaining({ seat: "goalHijack.analyze" })] });
  });
  it("revokes advisory continuation if a later CSML check raises the tier", async () => {
    const { gateway, request } = setup(0, {
      ...inject("goalHijack.analyze", "throw").config, pluginFailurePolicies: { "goalHijack.analyze": "advisory" },
      csmlEscalation: { evaluateAgent: async () => ({ escalated: true, resultTier: ApprovalTier.T3_COMMIT, csmlScore: 1, reason: "requires oversight" }) },
    });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(expect.objectContaining({ seat: "goalHijack.analyze", policy: "deny" }));
  });
});

describe("circuit outage and audit boundaries", () => {
  it("a failed read never closes a manually tripped circuit", async () => {
    const breaker = new InMemoryCircuitBreaker();
    const context = setup(0, { circuitBreaker: {
      getState: fault("reject"), recordSuccess: id => breaker.recordSuccess(id),
      recordDenial: (id, reason) => breaker.recordDenial(id, reason), trip: (id, reason) => breaker.trip(id, reason), reset: id => breaker.reset(id),
    } });
    await breaker.trip(context.request.agentId, "operator stop");
    expect((await context.gateway.intercept(context.request)).action).toBe("deny");
    expect(await breaker.getState(context.request.agentId)).toBe("OPEN");
  });
  it("a reported OPEN state during success recording denies current execution", async () => {
    const { gateway, request } = setup(0, { circuitBreaker: { ...healthyBreaker(), recordSuccess: async () => "OPEN" } });
    expect((await gateway.intercept(request)).denial?.policyViolated).toBe("CIRCUIT_OPEN");
  });
  it("a token-bound rate limit requires an enforcement store", async () => {
    const { gateway, request } = setup(0, {}, { constraints: { rateLimit: { maxCalls: 1, windowMs: 60_000 } } });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(expect.objectContaining({ seat: "rateLimit.increment", kind: "missing_dependency" }));
  });
  it.each(["throw", "reject", "timeout", "error_result"])("ledger %s never returns an unrecorded allow", async kind => {
    const { gateway, request } = setup(0, { emitLedgerEvent: fault(kind) });
    const decision = await gateway.intercept(request);
    expect(decision).toMatchObject({ action: "deny", denial: { policyViolated: "AUDIT_UNAVAILABLE" } });
    expect(decision.transformations?.additionalAuditFields).toMatchObject({ auditStatus: "unavailable", pluginFailures: [expect.objectContaining({ seat: "audit.append" })] });
  });
  it("retains an original denial if its ledger append also fails", async () => {
    const { gateway, request } = setup(0, { ...inject("circuitBreaker.getState", "throw").config, emitLedgerEvent: fault("throw") });
    const decision = await gateway.intercept(request);
    expect(decision.denial?.policyViolated).toBe("POLICY_PLUGIN_UNAVAILABLE");
    expect(decision.transformations?.additionalAuditFields?.["auditStatus"]).toBe("unavailable");
  });
  it("isolates failures between overlapping requests", async () => {
    const context = setup(0, { goalHijackDetector: { analyze: params => {
      if (params["broken"]) throw new Error("secret");
      return { hijackDetected: false, confidence: 0, patterns: [] };
    } } });
    const broken = { ...context.request, requestId: generateUUIDv7(), params: { broken: true } };
    const [one, two] = await Promise.all([context.gateway.intercept(broken), context.gateway.intercept(context.request)]);
    expect(one.action).toBe("deny"); expect(two.action).toBe("allow");
    expect(two.transformations?.additionalAuditFields?.["pluginFailures"]).toBeUndefined();
    const emittedFailures = context.events.filter(event => event.eventType === "policy.plugin.failed");
    expect(emittedFailures).toHaveLength(1);
    expect(emittedFailures[0].payload.requestId).toBe(broken.requestId);
  });
  it("rejects invalid timeout configuration", async () => {
    const { gateway, request } = setup(0, { pluginTimeoutMs: Number.NaN });
    expect((await gateway.intercept(request)).action).toBe("deny");
  });
  it("caller e-stop wins over even a hanging or contradictory permit resolver", async () => {
    const resolver = vi.fn(fault("timeout"));
    const { gateway, request } = setup(0, { safetyPermit: { resolvePermit: resolver } }, {}, { executionContext: { hardwareSafety: { estopState: "triggered" } } });
    expect((await gateway.intercept(request)).denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
    expect(resolver).not.toHaveBeenCalled();
  });
});


describe("external dispatch and late completion", () => {
  it.each([0, 1, 2, 3])("a failed required gate blocks the real MCP middleware handler at T%s", async tier => {
    const { gateway, request, token } = setup(tier, inject("circuitBreaker.getState", "reject").config);
    const handler = vi.fn(async () => "external side effect");
    const identity = new URL(resources[tier]!);
    const middleware = createSintMiddleware({ gateway, serverName: identity.hostname });
    const protectedHandler = middleware.protect(handler, request.agentId, token.tokenId);
    await expect(protectedHandler({ callId: "fixture", serverName: identity.hostname, toolName: identity.pathname.slice(1), arguments: {}, timestamp: request.timestamp })).rejects.toThrow("denied");
    expect(handler).not.toHaveBeenCalled();
  });
  it("late success after timeout cannot change the returned denial or append false success evidence", async () => {
    let finish!: (value: { maxVelocityMps: number }) => void;
    const late = new Promise<{ maxVelocityMps: number }>(resolve => { finish = resolve; });
    const { gateway, request, events } = setup(0, { dynamicEnvelope: { computeEnvelope: () => late }, pluginTimeoutMs: 5 });
    const decision = await gateway.intercept(request);
    const before = JSON.stringify({ decision, events });
    expect(decision.action).toBe("deny");
    finish({ maxVelocityMps: 0.1 });
    await Promise.resolve(); await Promise.resolve();
    expect(JSON.stringify({ decision, events })).toBe(before);
    expect(events.some(event => event.eventType === "policy.envelope.applied")).toBe(false);
  });
  it("late rejection after timeout is handled without an unhandled rejection", async () => {
    let reject!: (reason: unknown) => void;
    const late = new Promise<never>((_resolve, fail) => { reject = fail; });
    const { gateway, request } = setup(0, { dynamicEnvelope: { computeEnvelope: () => late }, pluginTimeoutMs: 5 });
    expect((await gateway.intercept(request)).action).toBe("deny");
    reject(new Error("late failure"));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  it("CSML cannot lower an existing consequence tier", async () => {
    const { gateway, request } = setup(3, { csmlEscalation: { evaluateAgent: async () => ({ escalated: true, resultTier: ApprovalTier.T0_OBSERVE, csmlScore: 0, reason: "invalid lowering" }) } });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(expect.objectContaining({ seat: "csml.evaluateAgent", kind: "invalid_result" }));
  });
  it("a successful anomalous trip also blocks the current action", async () => {
    const context = setup(0, { circuitBreaker: healthyBreaker(), csmlEscalation: { evaluateAgent: async () => ({ escalated: false, resultTier: ApprovalTier.T0_OBSERVE, csmlScore: 1, reason: "anomalous persona" }) } });
    expect((await context.gateway.intercept(context.request)).denial?.policyViolated).toBe("CIRCUIT_OPEN");
  });
  it("records optional replication failures in the primary ledger without recursive replication", async () => {
    const replicate = vi.fn(fault("reject"));
    const { gateway, request, events } = setup(0, { edgeControlPlane: { checkCentralEscalation: async () => ({ allowed: true }), replicateEvidenceEvent: replicate } });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("allow");
    expect(replicate).toHaveBeenCalledTimes(1);
    expect(events.filter(event => event.eventType === "policy.plugin.failed")).toHaveLength(1);
    expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(expect.objectContaining({ seat: "edge.replicateEvidenceEvent", policy: "observe" }));
  });
});


describe("acknowledgement semantics", () => {
  it.each(["throw", "reject", "timeout", "error_result"])("ledger %s prevents billing", async kind => {
    const charge = vi.fn(async () => {});
    const { gateway, request } = setup(0, {
      emitLedgerEvent: fault(kind),
      economyPlugin: { preIntercept: async () => undefined, postIntercept: charge },
    });
    expect((await gateway.intercept(request)).denial?.policyViolated).toBe("AUDIT_UNAVAILABLE");
    expect(charge).not.toHaveBeenCalled();
  });
  it("waits for actual audit acknowledgement before charging", async () => {
    let acknowledge!: () => void;
    const pending = new Promise<void>(resolve => { acknowledge = resolve; });
    const charge = vi.fn(async () => {});
    const append = vi.fn(() => pending);
    const { gateway, request } = setup(0, { pluginTimeoutMs: 1000, emitLedgerEvent: append,
      economyPlugin: { preIntercept: async () => undefined, postIntercept: charge } });
    const decision = gateway.intercept(request);
    await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1));
    expect(charge).not.toHaveBeenCalled();
    acknowledge();
    expect((await decision).action).toBe("allow");
    expect(charge).toHaveBeenCalledTimes(1);
  });
  it("preserves a billing denial if recording its correction fails", async () => {
    const ledger = new LedgerWriter();
    const { gateway, request } = setup(0, {
      emitLedgerEvent: event => {
        if (event.eventType !== "policy.evaluated") return { ok: false, error: "storage down" };
        return ledger.append({ ...event, eventType: "policy.evaluated" });
      },
      economyPlugin: { preIntercept: async () => undefined, postIntercept: fault("reject") },
    });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("POLICY_PLUGIN_UNAVAILABLE");
    expect(decision.transformations?.additionalAuditFields?.["auditStatus"]).toBe("unavailable");
    expect(ledger.getAll()[0]!.payload["authorizationPendingPostChecks"]).toBe(true);
    expect(ledger.verifyChain().ok).toBe(true);
  });
  it("appends a registered billing correction and preserves existing decision audit fields", async () => {
    const ledger = new LedgerWriter();
    const { gateway, request } = setup(0, {
      emitLedgerEvent: event => ledger.append({ ...event, eventType: event.eventType as "policy.evaluated" }),
      economyPlugin: {
        preIntercept: async request => ({ requestId: request.requestId, timestamp: request.timestamp, action: "allow", assignedTier: ApprovalTier.T1_PREPARE, assignedRisk: RiskTier.T1_WRITE_LOW, transformations: { additionalAuditFields: { existing: "preserved" } } }),
        postIntercept: fault("error_result"),
      },
    });
    const decision = await gateway.intercept(request);
    expect(decision).toMatchObject({ action: "deny", assignedTier: ApprovalTier.T1_PREPARE, transformations: { additionalAuditFields: { existing: "preserved" } } });
    expect(ledger.getAll().map(event => event.eventType)).toEqual([SINT_EVENTS.POLICY_EVALUATED, SINT_EVENTS.POLICY_PLUGIN_FAILED, SINT_EVENTS.POLICY_DECISION_CORRECTED]);
    expect(ledger.getAll().at(-1)!.payload).toMatchObject({ requestId: request.requestId, previousDecision: "allow", decision: "deny" });
    expect(ledger.verifyChain()).toEqual({ ok: true, value: true });
  });
  it("does not invent an error when a void audit callback returns its appended value", async () => {
    const { gateway, request } = setup(0, { emitLedgerEvent: event => ({ ...event }) });
    expect((await gateway.intercept(request)).action).toBe("allow");
  });
  it("does not label an unconfigured optional trust callback as evaluated", async () => {
    const { gateway, request, events } = setup();
    await gateway.intercept(request);
    const checks = events.find(event => event.eventType === "policy.evaluated").payload.pluginChecks;
    expect(checks.some((check: any) => check.seat === "agentTrust.get")).toBe(false);
  });
  it("a timed-out append is marked pending acknowledgement rather than an execution receipt", async () => {
    let finish!: () => void;
    let candidate: any;
    const append = new Promise<void>(resolve => { finish = resolve; });
    const { gateway, request } = setup(0, { pluginTimeoutMs: 5, emitLedgerEvent: event => { candidate = event; return append; } });
    expect((await gateway.intercept(request)).denial?.policyViolated).toBe("AUDIT_UNAVAILABLE");
    expect(candidate.payload.authorizationPendingAudit).toBe(true);
    finish(); await Promise.resolve();
  });
});


describe("append-only failure evidence", () => {
  it("writes the registered failure event and correlated decision into a valid hash chain", async () => {
    const ledger = new LedgerWriter();
    const { gateway, request } = setup(0, {
      ...inject("goalHijack.analyze", "throw").config,
      emitLedgerEvent: event => {
        if (event.eventType !== SINT_EVENTS.POLICY_PLUGIN_FAILED && event.eventType !== SINT_EVENTS.POLICY_EVALUATED) throw new Error("unexpected fixture event");
        return ledger.append({ ...event, eventType: event.eventType });
      },
    });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(ledger.verifyChain().ok).toBe(true);
    const events = ledger.getAll();
    expect(events.map(event => event.eventType)).toEqual([SINT_EVENTS.POLICY_PLUGIN_FAILED, SINT_EVENTS.POLICY_EVALUATED]);
    expect(events.every(event => event.payload["requestId"] === request.requestId)).toBe(true);
    expect(events[1]!.previousHash).toBe(events[0]!.hash);
    expect(events[1]!.payload["pluginFailures"]).toEqual(decision.transformations?.additionalAuditFields?.["pluginFailures"]);
  });
});


describe("non-overridable semantic invariants", () => {
  it("an advisory CSML detector still cannot propose a lower tier", async () => {
    const { gateway, request } = setup(1, {
      pluginFailurePolicies: { "csml.evaluateAgent": "advisory" },
      csmlEscalation: { evaluateAgent: async () => ({ escalated: true, resultTier: ApprovalTier.T0_OBSERVE, csmlScore: 0, reason: "invalid lowering" }) },
    });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(expect.objectContaining({ seat: "csml.evaluateAgent", policy: "deny" }));
  });
});
