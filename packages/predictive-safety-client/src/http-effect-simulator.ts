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
  readonly fetch?: typeof globalThis.fetch;
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

  constructor(private readonly options: HttpEffectSimulatorOptions) {
    this.backend = options.backend;
    this.supportedGrades = options.supportedGrades;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.trustedSignerKeys = new Set(options.trustedSignerKeys);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetch = options.fetch ?? globalThis.fetch;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}/v1/simulate`, {
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
      return failure(
        timedOut
          ? `Simulation worker timed out after ${this.timeoutMs}ms`
          : `Simulation worker request failed: ${cause instanceof Error ? cause.message : "network error"}`,
        true,
      );
    }
    clearTimeout(timeout);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return failure("Simulation worker returned non-JSON output", response.status >= 500);
    }

    if (!response.ok) {
      const parsedError = effectSimulationErrorSchema.safeParse(
        body && typeof body === "object" && "error" in body ? body.error : body,
      );
      return parsedError.success
        ? err(parsedError.data)
        : failure(`Simulation worker rejected the request with HTTP ${response.status}`, response.status >= 500);
    }

    const receiptCandidate = body && typeof body === "object" && "receipt" in body
      ? body.receipt
      : body;
    const parsedReceipt = simulationEvidenceReceiptSchema.safeParse(receiptCandidate);
    if (!parsedReceipt.success) {
      return failure("Simulation worker returned a malformed V2 receipt", false);
    }
    const receipt = parsedReceipt.data;
    if (!this.trustedSignerKeys.has(receipt.signerPublicKey)) {
      return failure("Simulation worker receipt signer is not trusted by the client", false);
    }
    if (!verify(receipt.signerPublicKey, receipt.signature, signingPayload(receipt))) {
      return failure("Simulation worker receipt signature is invalid", false);
    }
    if (
      receipt.requestDigest !== preflight.effectPlan.requestDigest
      || receipt.effectPlanDigest !== preflight.effectPlan.effectPlanDigest
      || receipt.tokenDigest !== preflight.effectPlan.tokenDigest
      || receipt.resource !== preflight.effectPlan.resource
      || receipt.action !== preflight.effectPlan.action
      || receipt.worldSnapshot.digest !== worldSnapshot.digest
    ) {
      return failure("Simulation worker receipt is not bound to the submitted preflight and world state", false);
    }
    if (!this.supportedGrades.includes(receipt.evidenceGrade)) {
      return failure(`Simulation worker returned undeclared ${receipt.evidenceGrade} evidence`, false);
    }

    return ok(receipt);
  }
}
