import {
  canonicalJsonStringify,
  effectSimulationErrorSchema,
  err,
  ok,
  simulationEvidenceReceiptSchema,
  type EffectSimulationError,
  type EffectSimulator,
  type Result,
  type SimulationEvidenceGrade,
  type SimulationEvidenceReceipt,
  type SimulationPreflight,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { verify } from "@pshkv/gate-capability-tokens";

export interface HttpEffectSimulatorOptions {
  readonly baseUrl: string;
  readonly backend: string;
  readonly supportedGrades: readonly SimulationEvidenceGrade[];
  readonly trustedSignerKeys: readonly string[];
  readonly bearerToken?: string;
  readonly timeoutMs?: number;
  /** Consecutive retryable worker failures that open the circuit. Unset means no limit. */
  readonly failureThreshold?: number;
  /** Model digest included in a signed receipt cache key. Unset means no cache. */
  readonly modelDigest?: string;
  /** Signed receipts reused for the same effect plan, world, and model. Unset means no cache. */
  readonly receiptCache?: SignedSimulationReceiptCache;
  /** Region whose worker receives the call. Unset means baseUrl. */
  readonly region?: string;
  /** Workers addressed by region. Unset means baseUrl. */
  readonly regions?: readonly SimulationWorkerRegion[];
  readonly fetch?: typeof globalThis.fetch;
}

export interface SimulationWorkerRegion {
  readonly region: string;
  readonly baseUrl: string;
}

export interface SignedSimulationReceiptCacheKey {
  readonly effectPlanDigest: string;
  readonly worldDigest: string;
  readonly modelDigest: string;
}

export interface SignedSimulationReceiptCache {
  get(key: SignedSimulationReceiptCacheKey): SimulationEvidenceReceipt | undefined;
  set(key: SignedSimulationReceiptCacheKey, receipt: SimulationEvidenceReceipt): void;
}

function signingPayload(receipt: SimulationEvidenceReceipt): string {
  const { signature: _signature, ...payload } = receipt;
  return canonicalJsonStringify(payload);
}

function failure(message: string, retryable: boolean): Result<never, EffectSimulationError> {
  return err({ code: "SIMULATION_FAILED", message, retryable });
}

/** Remote EffectSimulator with local schema, signature, and binding verification. */
export class HttpEffectSimulator implements EffectSimulator {
  readonly backend: string;
  readonly supportedGrades: readonly SimulationEvidenceGrade[];

  private readonly baseUrl: string;
  private readonly trustedSignerKeys: ReadonlySet<string>;
  private readonly timeoutMs: number;
  private readonly fetch: typeof globalThis.fetch;
  private consecutiveFailures = 0;

  constructor(private readonly options: HttpEffectSimulatorOptions) {
    this.backend = options.backend;
    this.supportedGrades = options.supportedGrades;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.trustedSignerKeys = new Set(options.trustedSignerKeys);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  private cacheKey(
    preflight: SimulationPreflight,
    worldSnapshot: SimulationWorldSnapshot,
  ): SignedSimulationReceiptCacheKey | undefined {
    const modelDigest = this.options.modelDigest;
    if (modelDigest === undefined || this.options.receiptCache === undefined) return undefined;
    return {
      effectPlanDigest: preflight.effectPlan.effectPlanDigest,
      worldDigest: worldSnapshot.digest,
      modelDigest,
    };
  }

  private signedCacheHit(
    candidate: SimulationEvidenceReceipt,
    preflight: SimulationPreflight,
    worldSnapshot: SimulationWorldSnapshot,
    modelDigest: string,
  ): SimulationEvidenceReceipt | undefined {
    const parsed = simulationEvidenceReceiptSchema.safeParse(candidate);
    if (!parsed.success) return undefined;
    const receipt = parsed.data;
    if (receipt.simulator.modelDigest !== modelDigest) return undefined;
    if (!this.trustedSignerKeys.has(receipt.signerPublicKey)) return undefined;
    if (!verify(receipt.signerPublicKey, receipt.signature, signingPayload(receipt))) return undefined;
    if (
      receipt.requestDigest !== preflight.effectPlan.requestDigest
      || receipt.effectPlanDigest !== preflight.effectPlan.effectPlanDigest
      || receipt.tokenDigest !== preflight.effectPlan.tokenDigest
      || receipt.resource !== preflight.effectPlan.resource
      || receipt.action !== preflight.effectPlan.action
      || receipt.worldSnapshot.digest !== worldSnapshot.digest
    ) {
      return undefined;
    }
    if (!this.supportedGrades.includes(receipt.evidenceGrade)) return undefined;
    return receipt;
  }

  private finish(
    result: Result<SimulationEvidenceReceipt, EffectSimulationError>,
  ): Result<SimulationEvidenceReceipt, EffectSimulationError> {
    if (this.options.failureThreshold === undefined) return result;
    if (result.ok) {
      this.consecutiveFailures = 0;
      return result;
    }
    if (result.error.retryable) this.consecutiveFailures += 1;
    return result;
  }

  async simulate(
    preflight: SimulationPreflight,
    worldSnapshot?: SimulationWorldSnapshot,
  ): Promise<Result<SimulationEvidenceReceipt, EffectSimulationError>> {
    if (!worldSnapshot) {
      return err({
        code: "WORLD_SNAPSHOT_REQUIRED",
        message: "Remote simulation requires an exact world snapshot",
        retryable: true,
      });
    }
    const key = this.cacheKey(preflight, worldSnapshot);
    if (key !== undefined) {
      const cached = this.options.receiptCache?.get(key);
      if (cached !== undefined) {
        const hit = this.signedCacheHit(cached, preflight, worldSnapshot, key.modelDigest);
        if (hit !== undefined) return ok(hit);
      }
    }
    if (
      this.options.failureThreshold !== undefined
      && this.consecutiveFailures >= this.options.failureThreshold
    ) {
      return failure("Simulation worker circuit is open", false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      const regionalBase = this.options.regions?.find((entry) => entry.region === this.options.region)?.baseUrl;
      const workerBase = (regionalBase ?? this.baseUrl).replace(/\/$/, "");
      response = await this.fetch(`${workerBase}/v1/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.options.bearerToken !== undefined && {
            Authorization: `Bearer ${this.options.bearerToken}`,
          }),
        },
        body: JSON.stringify({ preflight, worldSnapshot }),
        signal: controller.signal,
      });
    } catch (cause) {
      clearTimeout(timeout);
      const timedOut = controller.signal.aborted;
      return this.finish(failure(
        timedOut
          ? `Simulation worker timed out after ${this.timeoutMs}ms`
          : `Simulation worker request failed: ${cause instanceof Error ? cause.message : "network error"}`,
        true,
      ));
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      const timedOut = controller.signal.aborted;
      return this.finish(failure(
        timedOut
          ? `Simulation worker timed out after ${this.timeoutMs}ms`
          : "Simulation worker returned non-JSON output",
        timedOut || response.status >= 500,
      ));
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const parsedError = effectSimulationErrorSchema.safeParse(
        body && typeof body === "object" && "error" in body ? body.error : body,
      );
      return this.finish(parsedError.success
        ? err(parsedError.data)
        : failure(`Simulation worker rejected the request with HTTP ${response.status}`, response.status >= 500));
    }

    const receiptCandidate = body && typeof body === "object" && "receipt" in body
      ? body.receipt
      : body;
    const parsedReceipt = simulationEvidenceReceiptSchema.safeParse(receiptCandidate);
    if (!parsedReceipt.success) {
      return this.finish(failure("Simulation worker returned a malformed V2 receipt", false));
    }
    const receipt = parsedReceipt.data;
    if (!this.trustedSignerKeys.has(receipt.signerPublicKey)) {
      return this.finish(failure("Simulation worker receipt signer is not trusted by the client", false));
    }
    if (!verify(receipt.signerPublicKey, receipt.signature, signingPayload(receipt))) {
      return this.finish(failure("Simulation worker receipt signature is invalid", false));
    }
    if (
      receipt.requestDigest !== preflight.effectPlan.requestDigest
      || receipt.effectPlanDigest !== preflight.effectPlan.effectPlanDigest
      || receipt.tokenDigest !== preflight.effectPlan.tokenDigest
      || receipt.resource !== preflight.effectPlan.resource
      || receipt.action !== preflight.effectPlan.action
      || receipt.worldSnapshot.digest !== worldSnapshot.digest
    ) {
      return this.finish(failure("Simulation worker receipt is not bound to the submitted preflight and world state", false));
    }
    if (!this.supportedGrades.includes(receipt.evidenceGrade)) {
      return this.finish(failure(`Simulation worker returned undeclared ${receipt.evidenceGrade} evidence`, false));
    }

    if (key !== undefined && receipt.simulator.modelDigest === key.modelDigest) {
      this.options.receiptCache?.set(key, receipt);
    }
    return this.finish(ok(receipt));
  }
}
