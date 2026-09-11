import type {
  ContinuousEffectLease,
  ContinuousEffectState,
  PolicyDecision,
  Result,
  SintRequest,
} from "@pshkv/core";
import { err, ok } from "@pshkv/core";
import { generateUUIDv7 } from "@pshkv/gate-capability-tokens";
import { PolicyGateway, type LedgerEmitter } from "./gateway.js";

export interface ContinuousEffectCoordinatorOptions {
  readonly renewalIntervalMs?: number;
  readonly leaseDurationMs?: number;
  readonly stopEffect: (
    lease: ContinuousEffectLease,
    reason: string,
  ) => Promise<void> | void;
  readonly emitLedgerEvent?: LedgerEmitter;
  readonly now?: () => number;
}

export interface ContinuousEffectAdmission {
  readonly lease: ContinuousEffectLease;
  readonly decision: PolicyDecision;
}

export interface ContinuousEffectCoordinatorError {
  readonly code:
    | "ADMISSION_DENIED"
    | "LEASE_NOT_FOUND"
    | "INVALID_STATE"
    | "REQUEST_MISMATCH"
    | "RENEWAL_DENIED"
    | "STOP_FAILED";
  readonly decision?: PolicyDecision;
  readonly state?: ContinuousEffectState;
  readonly reason?: string;
}

/**
 * Binds a continuous effect to repeated gateway decisions and a fail-safe stop.
 *
 * This coordinator owns lifecycle bookkeeping only. It never authorizes an
 * action independently of `PolicyGateway.intercept()`.
 */
export class ContinuousEffectCoordinator {
  private readonly leases = new Map<string, ContinuousEffectLease>();
  private readonly renewalIntervalMs: number;
  private readonly leaseDurationMs: number;
  private readonly now: () => number;

  public constructor(
    private readonly gateway: PolicyGateway,
    private readonly options: ContinuousEffectCoordinatorOptions,
  ) {
    this.renewalIntervalMs = options.renewalIntervalMs ?? 5_000;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  public async admit(
    request: SintRequest,
  ): Promise<Result<ContinuousEffectAdmission, ContinuousEffectCoordinatorError>> {
    const decision = await this.gateway.intercept(request);
    if (decision.action === "deny") {
      return err({ code: "ADMISSION_DENIED", decision });
    }

    const admittedAt = this.timestamp();
    const lease: ContinuousEffectLease = {
      leaseId: generateUUIDv7(),
      actionRef: request.requestId,
      agentId: request.agentId,
      tokenId: request.tokenId,
      resource: request.resource,
      action: request.action,
      state: decision.action === "escalate" ? "PENDING_APPROVAL" : "ACTIVE",
      admittedAt,
      renewBy: this.timestamp(this.now() + this.renewalIntervalMs),
      expiresAt: this.timestamp(this.now() + this.leaseDurationMs),
    };
    this.leases.set(lease.leaseId, lease);
    return ok({ lease, decision });
  }

  public approve(
    leaseId: string,
  ): Result<ContinuousEffectLease, ContinuousEffectCoordinatorError> {
    const lease = this.leases.get(leaseId);
    if (!lease) return err({ code: "LEASE_NOT_FOUND" });
    if (lease.state !== "PENDING_APPROVAL") {
      return err({ code: "INVALID_STATE", state: lease.state });
    }
    const next = { ...lease, state: "ACTIVE" as const };
    this.leases.set(leaseId, next);
    return ok(next);
  }

  public async renew(
    leaseId: string,
    request: SintRequest,
  ): Promise<Result<ContinuousEffectLease, ContinuousEffectCoordinatorError>> {
    const lease = this.leases.get(leaseId);
    if (!lease) return err({ code: "LEASE_NOT_FOUND" });
    if (lease.state !== "ACTIVE") {
      return err({ code: "INVALID_STATE", state: lease.state });
    }
    if (
      request.agentId !== lease.agentId
      || request.tokenId !== lease.tokenId
      || request.resource !== lease.resource
      || request.action !== lease.action
    ) {
      return err({ code: "REQUEST_MISMATCH", state: lease.state });
    }

    const decision = await this.gateway.intercept(request);
    if (decision.action === "deny") {
      const suspended = { ...lease, state: "SUSPENDED" as const };
      this.leases.set(leaseId, suspended);
      const stopped = await this.stop(suspended, decision.denial?.reason ?? "renewal denied");
      if (!stopped.ok) return err({ code: "STOP_FAILED", reason: stopped.error.message });
      return err({ code: "RENEWAL_DENIED", decision, state: stopped.value.state });
    }

    const renewed = {
      ...lease,
      renewBy: this.timestamp(this.now() + this.renewalIntervalMs),
    };
    this.leases.set(leaseId, renewed);
    return ok(renewed);
  }

  public async expire(
    leaseId: string,
  ): Promise<Result<ContinuousEffectLease, ContinuousEffectCoordinatorError>> {
    const lease = this.leases.get(leaseId);
    if (!lease) return err({ code: "LEASE_NOT_FOUND" });
    if (lease.state !== "ACTIVE" && lease.state !== "PENDING_APPROVAL") {
      return err({ code: "INVALID_STATE", state: lease.state });
    }
    const suspended = { ...lease, state: "SUSPENDED" as const };
    this.leases.set(leaseId, suspended);
    const stopped = await this.stop(suspended, "renewal deadline expired");
    if (!stopped.ok) return err({ code: "STOP_FAILED", reason: stopped.error.message });
    return ok(stopped.value);
  }

  public async stop(
    lease: ContinuousEffectLease,
    reason: string,
  ): Promise<Result<ContinuousEffectLease, Error>> {
    this.options.emitLedgerEvent?.({
      eventType: "safety.estop.triggered",
      agentId: lease.agentId,
      tokenId: lease.tokenId,
      payload: { actionRef: lease.actionRef, leaseId: lease.leaseId, reason },
    });
    try {
      await this.options.stopEffect(lease, reason);
    } catch (error) {
      const stopError = new Error(`Continuous effect stop failed: ${String(error)}`);
      this.options.emitLedgerEvent?.({
        eventType: "action.failed",
        agentId: lease.agentId,
        tokenId: lease.tokenId,
        payload: { actionRef: lease.actionRef, leaseId: lease.leaseId, reason: stopError.message },
      });
      return err(stopError);
    }
    const rolledBack = { ...lease, state: "ROLLEDBACK" as const };
    this.leases.set(lease.leaseId, rolledBack);
    this.options.emitLedgerEvent?.({
      eventType: "action.rolledback",
      agentId: lease.agentId,
      tokenId: lease.tokenId,
      payload: { actionRef: lease.actionRef, leaseId: lease.leaseId, reason },
    });
    return ok(rolledBack);
  }

  public get(leaseId: string): ContinuousEffectLease | undefined {
    return this.leases.get(leaseId);
  }

  private timestamp(milliseconds = this.now()): string {
    return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, ".000000Z");
  }
}
