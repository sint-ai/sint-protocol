/** Request-scoped plugin execution, failure policy, and audit finalization. */
import { z } from "zod";
import { ApprovalTier, RiskTier, ok, err, type Result, type PolicyDecision, type SintRequest } from "@pshkv/core";

export type AdvisoryPluginSeat = "goalHijack.analyze" | "memoryIntegrity.check" | "csml.evaluateAgent" | "argInjection.analyze";
export type PluginFailurePolicy = "deny" | "advisory";
export type PluginFailureKind = "exception" | "timeout" | "error_result" | "invalid_result" | "invalid_configuration" | "missing_dependency";
export interface PluginFailure {
  readonly requestId: string;
  readonly seat: string;
  readonly kind: PluginFailureKind;
  readonly policy: PluginFailurePolicy | "observe";
}
export interface PluginFailureOptions {
  /** Only these non-authoritative detectors may opt into advisory T0/T1 behavior. */
  readonly pluginFailurePolicies?: Partial<Record<AdvisoryPluginSeat, PluginFailurePolicy>>;
  /** Async settlement deadline per hook, 1..30,000 ms; default 2,000 ms. */
  readonly pluginTimeoutMs?: number;
}
export interface AuditEvent {
  readonly eventType: string;
  readonly agentId: string;
  readonly tokenId?: string;
  readonly payload: Record<string, unknown>;
}
const advisorySeats = new Set<string>(["goalHijack.analyze", "memoryIntegrity.check", "csml.evaluateAgent", "argInjection.analyze"]);
const tierSchema = z.nativeEnum(ApprovalTier);
const severity = z.enum(["low", "medium", "high"]);
const strings = z.array(z.string());
const finiteNonnegative = z.number().finite().nonnegative();
const state = z.enum(["CLOSED", "OPEN", "HALF_OPEN"]);
const decisionSchema = z.object({
  requestId: z.string(), timestamp: z.string(), assignedTier: tierSchema,
  assignedRisk: z.nativeEnum(RiskTier), action: z.enum(["allow", "deny", "escalate", "transform"]),
  denial: z.object({ reason: z.string(), policyViolated: z.string() }).optional(),
  escalation: z.object({ requiredTier: tierSchema, reason: z.string(), timeoutMs: finiteNonnegative, fallbackAction: z.enum(["deny", "safe-stop"]) }).optional(),
}).refine(value => value.action !== "deny" || value.denial !== undefined)
  .refine(value => value.action !== "escalate" || value.escalation !== undefined);
const schemas: Record<string, z.ZodTypeAny> = {
  "goalHijack.analyze": z.object({ hijackDetected: z.boolean(), confidence: z.number().min(0).max(1), patterns: strings }),
  "memoryIntegrity.check": z.object({ poisoned: z.boolean(), anomalies: strings, severity }),
  "circuitBreaker.getState": state,
  "circuitBreaker.recordSuccess": state,
  "circuitBreaker.recordDenial": state,
  "circuitBreaker.trip": z.unknown(),
  "rateLimit.increment": z.number().finite().int().positive(),
  "economy.preIntercept": decisionSchema.optional(),
  "economy.postIntercept": z.unknown(),
  "supplyChain.verify": z.object({ verified: z.boolean(), violations: strings, severity }),
  "csml.evaluateAgent": z.object({ escalated: z.boolean(), resultTier: tierSchema, csmlScore: z.number().finite().nullable(), reason: z.string() }),
  "safetyPermit.resolve": z.object({ permitState: z.enum(["granted", "denied", "unknown", "stale"]), observedAt: z.string().datetime({ offset: true }), source: z.string(), interlockState: z.enum(["closed", "open", "fault", "unknown"]).optional(), estopState: z.enum(["clear", "triggered", "unknown"]).optional() }),
  "argInjection.analyze": z.object({ detected: z.boolean(), patterns: strings, severity, confidence: z.number().min(0).max(1) }),
  "dynamicEnvelope.compute": z.object({ maxVelocityMps: finiteNonnegative.optional(), maxForceNewtons: finiteNonnegative.optional(), reason: z.string().optional() }).strict(),
  "humanAuthority.evaluate": decisionSchema.optional(),
  "spatialIntegrity.evaluate": decisionSchema.optional(),
  "regulatedData.evaluate": decisionSchema.optional(),
  "autonomy.preIntercept": decisionSchema.optional(),
  "codeAsPolicy.verify": z.object({ verified: z.boolean(), violations: z.array(z.unknown()), severity }),
  "verifiableCompute.verify": z.object({ verified: z.boolean() }),
  "spatialCorridor.verify": z.object({ verified: z.boolean(), insideCorridor: z.boolean().optional(), lateralDeviationMeters: finiteNonnegative.optional(), headingDeviationDeg: finiteNonnegative.optional() }),
  "edge.checkCentralEscalation": z.object({ allowed: z.boolean() }),
  "edge.relayRevocation": z.unknown(),
  "edge.replicateEvidenceEvent": z.unknown(),
  "audit.append": z.unknown(),
  "token.resolve": z.object({ tokenId: z.string() }).optional(),
  "revocation.check": z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), error: z.string() })]),
  "agentTrust.get": z.enum(["untrusted", "provisional", "trusted", "verified"]).optional(),
};
const failureCodes: Record<string, string> = {
  "humanAuthority.evaluate": "HUMAN_AUTHORITY_POLICY_ERROR",
  "spatialIntegrity.evaluate": "SPATIAL_INTEGRITY_POLICY_ERROR",
  "regulatedData.evaluate": "REGULATED_DATA_POLICY_ERROR",
  "autonomy.preIntercept": "AUTONOMY_SUPERVISOR_ERROR",
  "codeAsPolicy.verify": "CODE_AS_POLICY_GUARD_ERROR",
  "verifiableCompute.verify": "CONSTRAINT_VIOLATION",
  "spatialCorridor.verify": "SPATIAL_CORRIDOR_VERIFICATION_FAILED",
  "edge.checkCentralEscalation": "EDGE_CENTRAL_UNAVAILABLE",
};

export class PluginFailureScope {
  readonly failures: PluginFailure[] = [];
  private readonly events: AuditEvent[] = [];
  private evaluationDetails: Record<string, unknown> = {};
  private readonly checks: { seat: string; status: "success" | "failed" }[] = [];
  private readonly timeoutMs: number;
  constructor(
    private readonly request: SintRequest,
    private readonly options: PluginFailureOptions,
    private readonly baselineTier: ApprovalTier,
  ) { this.timeoutMs = options.pluginTimeoutMs ?? 2_000; }

  emit(eventType: string, agentId: string, tokenId: string | undefined, payload: Record<string, unknown>): void {
    if (eventType === "policy.evaluated") { this.evaluationDetails = { ...this.evaluationDetails, ...payload }; return; } // One final, accurate decision record, including early returns.
    this.events.push({ eventType, agentId, tokenId, payload: { ...payload, requestId: this.request.requestId } });
  }

  private failure(seat: string, kind: PluginFailureKind): PluginFailure {
    const requested = this.options.pluginFailurePolicies?.[seat as AdvisoryPluginSeat];
    const policy = seat.startsWith("edge.replicate") || seat === "edge.relayRevocation" ? "observe" : advisorySeats.has(seat) && requested === "advisory"
      && (this.baselineTier === ApprovalTier.T0_OBSERVE || this.baselineTier === ApprovalTier.T1_PREPARE)
      ? "advisory" : "deny";
    const failure: PluginFailure = { requestId: this.request.requestId, seat, kind, policy };
    this.failures.push(failure);
    if (seat !== "audit.append") this.checks.push({ seat, status: "failed" });
    return failure;
  }

  async run<T>(seat: string, invoke: () => T | Promise<T>): Promise<Result<T, PluginFailure>> {
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30_000) {
      return err(this.failure(seat, "invalid_configuration"));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = Promise.resolve().then(invoke).then(
      value => {
        if (value && typeof value === "object" && "ok" in value && value.ok === false && seat !== "revocation.check") {
          return err<PluginFailureKind>("error_result");
        }
        const schema = schemas[seat];
        if (schema && !schema.safeParse(value).success) return err<PluginFailureKind>("invalid_result");
        return ok<T>(value);
      },
    ).catch(() => err<PluginFailureKind>("exception"));
    const timeout = new Promise<Result<T, PluginFailureKind>>(resolve => {
      timer = setTimeout(() => resolve(err("timeout")), this.timeoutMs);
    });
    const result = await Promise.race([outcome, timeout]);
    clearTimeout(timer);
    if (result.ok && seat !== "audit.append") this.checks.push({ seat, status: "success" });
    return result.ok ? result : err(this.failure(seat, result.error));
  }

  unexpected(): PolicyDecision { return this.deny(this.failure("gateway.internal", "exception")); }
  invalid(seat: string): PolicyDecision {
    // A semantic invariant (such as tier attenuation) is authoritative even
    // when the detector itself was configured as advisory.
    const failure = { ...this.failure(seat, "invalid_result"), policy: "deny" as const };
    this.failures[this.failures.length - 1] = failure;
    return this.deny(failure);
  }
  missing(seat: string): PolicyDecision { return this.deny(this.failure(seat, "missing_dependency")); }

  deny(failure: PluginFailure, previous?: PolicyDecision): PolicyDecision {
    if (previous?.action === "deny") return previous;
    return {
      requestId: this.request.requestId, timestamp: new Date().toISOString(), action: "deny",
      assignedTier: previous?.assignedTier ?? this.baselineTier,
      assignedRisk: previous?.assignedRisk ?? ({ [ApprovalTier.T0_OBSERVE]: RiskTier.T0_READ, [ApprovalTier.T1_PREPARE]: RiskTier.T1_WRITE_LOW, [ApprovalTier.T2_ACT]: RiskTier.T2_STATEFUL, [ApprovalTier.T3_COMMIT]: RiskTier.T3_IRREVERSIBLE })[this.baselineTier],
      denial: { policyViolated: failureCodes[failure.seat] ?? "POLICY_PLUGIN_UNAVAILABLE", reason: `Required policy check unavailable: ${failure.seat} (${failure.kind})` },
    };
  }

  async check<T>(seat: string, invoke: () => T | Promise<T>, success: (value: T) => PolicyDecision | undefined | void | Promise<PolicyDecision | undefined | void>): Promise<PolicyDecision | undefined> {
    const result = await this.run(seat, invoke);
    if (!result.ok) return result.error.policy === "deny" ? this.deny(result.error) : undefined;
    return (await success(result.value)) ?? undefined;
  }

  private decorate(decision: PolicyDecision, auditStatus: string): PolicyDecision {
    if (!this.failures.length && auditStatus !== "unavailable") return decision;
    return {
      ...decision,
      transformations: {
        ...decision.transformations,
        additionalAuditFields: {
          ...decision.transformations?.additionalAuditFields,
          pluginFailures: this.failures.map(value => ({ ...value })),
          pluginChecks: this.checks.map(value => ({ ...value })),
          auditStatus,
        },
      },
    };
  }

  async finalize(
    original: PolicyDecision,
    append?: (event: AuditEvent) => unknown,
    replicate?: (event: AuditEvent) => void | Promise<void>,
  ): Promise<PolicyDecision> {
    let decision = original;
    // Advisory continuation never applies to an eventual high-consequence decision.
    if (decision.assignedTier === ApprovalTier.T2_ACT || decision.assignedTier === ApprovalTier.T3_COMMIT) {
      for (let index = 0; index < this.failures.length; index++) {
        const failure = this.failures[index]!;
        if (failure.policy === "advisory") {
          const enforced = { ...failure, policy: "deny" as const };
          this.failures[index] = enforced;
          decision = this.deny(enforced, decision);
        }
      }
    }
    // Replication is optional telemetry, not an authorization dependency. Failures
    // are still attached to the decision and written to the primary ledger.
    if (replicate) {
      for (const event of [...this.events, {
        eventType: "policy.evaluated", agentId: this.request.agentId, tokenId: this.request.tokenId,
        payload: { requestId: this.request.requestId, decision: decision.action, tier: decision.assignedTier, risk: decision.assignedRisk },
      }]) await this.run("edge.replicateEvidenceEvent", () => replicate(event));
    }
    const auditStatus = append ? "recorded" : "not_configured";
    decision = this.decorate(decision, auditStatus);
    const failureEvents: AuditEvent[] = this.failures.map(failure => ({
      eventType: "policy.plugin.failed", agentId: this.request.agentId, tokenId: this.request.tokenId,
      payload: { ...failure, decision: decision.action, assignedTier: decision.assignedTier },
    }));
    const evaluated: AuditEvent = {
      eventType: "policy.evaluated", agentId: this.request.agentId, tokenId: this.request.tokenId,
      payload: { ...this.evaluationDetails, authorizationPendingAudit: Boolean(append), requestId: this.request.requestId, decision: decision.action, tier: decision.assignedTier,
        risk: decision.assignedRisk, policyViolated: decision.denial?.policyViolated,
        pluginFailures: decision.transformations?.additionalAuditFields?.["pluginFailures"] ?? [],
        pluginChecks: this.checks.map(value => ({ ...value })), auditStatus },
    };
    if (append) {
      for (const event of [...this.events, ...failureEvents, evaluated]) {
        const result = await this.run("audit.append", () => append(event));
        if (!result.ok) {
          const denied = this.deny(result.error, decision);
          return this.decorate({ ...denied, denial: decision.action === "deny" ? decision.denial : { policyViolated: "AUDIT_UNAVAILABLE", reason: "Required evidence ledger append did not complete" } }, "unavailable");
        }
      }
    }
    return decision;
  }
}
