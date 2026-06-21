import {
  err,
  ok,
  type ApprovalTier,
  type Result,
} from "@pshkv/core";
import {
  nowISO8601,
  type PhysicalActionContext,
  validateCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { EdgeJournal } from "./journal.js";
import {
  verifySignedDispatchEnvelope,
  verifySignedEffectPack,
} from "./signing.js";
import type {
  EdgeRunDenial,
  EdgeRunReceipt,
  EffectContract,
  EffectExecutionOutput,
  EffectExecutor,
  LocalAdmissionPolicy,
  SignedDispatchEnvelope,
  SignedEffectPack,
} from "./types.js";

const TIER_ORDER: Readonly<Record<ApprovalTier, number>> = {
  T0_observe: 0,
  T1_prepare: 1,
  T2_act: 2,
  T3_commit: 3,
};

function denial(code: EdgeRunDenial["code"], reason: string): Result<never, EdgeRunDenial> {
  return err({ code, reason });
}

function validateParameterValue(
  name: string,
  value: unknown,
  contract: EffectContract["parameters"][string],
): string | undefined {
  if (contract.type === "string") {
    if (typeof value !== "string") return `${name} must be a string`;
    if (contract.minLength !== undefined && value.length < contract.minLength) return `${name} is too short`;
    if (contract.maxLength !== undefined && value.length > contract.maxLength) return `${name} is too long`;
    if (contract.pattern !== undefined && !new RegExp(contract.pattern).test(value)) {
      return `${name} does not match its allowed pattern`;
    }
  } else if (contract.type === "boolean") {
    if (typeof value !== "boolean") return `${name} must be a boolean`;
  } else {
    if (typeof value !== "number" || !Number.isFinite(value)) return `${name} must be a finite number`;
    if (contract.type === "integer" && !Number.isInteger(value)) return `${name} must be an integer`;
    if (contract.min !== undefined && value < contract.min) return `${name} is below its minimum`;
    if (contract.max !== undefined && value > contract.max) return `${name} exceeds its maximum`;
  }
  if (contract.enum !== undefined && !contract.enum.includes(value as never)) {
    return `${name} is not an allowed value`;
  }
  return undefined;
}

function validateParameters(
  effect: EffectContract,
  params: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const [name, contract] of Object.entries(effect.parameters)) {
    const value = params[name];
    if (value === undefined) {
      if (contract.required === true) return `${name} is required`;
      continue;
    }
    const invalid = validateParameterValue(name, value, contract);
    if (invalid !== undefined) return invalid;
  }
  if (effect.allowAdditionalParameters !== true) {
    const declared = new Set(Object.keys(effect.parameters));
    const extra = Object.keys(params).find((name) => !declared.has(name));
    if (extra !== undefined) return `${extra} is not declared by the effect contract`;
  }
  return undefined;
}

function redactAndLimit(
  output: string | undefined,
  effect: EffectContract,
): { output?: string; outputTruncated: boolean; redactionCount: number } {
  if (output === undefined) return { outputTruncated: false, redactionCount: 0 };
  const rawBytes = new TextEncoder().encode(output);
  const outputTruncated = rawBytes.length > effect.maxOutputBytes;
  let redacted = new TextDecoder().decode(rawBytes.slice(0, effect.maxOutputBytes));
  let redactionCount = 0;
  const secretPatterns = [
    String.raw`\bBearer\s+[A-Za-z0-9._~+/=-]+`,
    String.raw`\b(?:api[_-]?key|secret|token)\s*[=:]\s*["']?[A-Za-z0-9._~+/=-]{8,}`,
    String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`,
    ...(effect.secretPatterns ?? []),
  ];
  for (const source of secretPatterns) {
    const pattern = new RegExp(source, "gi");
    redacted = redacted.replace(pattern, () => {
      redactionCount += 1;
      return "[REDACTED]";
    });
  }
  return { output: redacted, outputTruncated, redactionCount };
}

function boundNumber(
  params: Readonly<Record<string, unknown>>,
  parameterName: string | undefined,
): number | undefined {
  if (parameterName === undefined) return undefined;
  const value = params[parameterName];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function derivePhysicalContext(
  effect: EffectContract,
  dispatch: SignedDispatchEnvelope,
): PhysicalActionContext | undefined {
  const bindings = effect.physicalBindings;
  if (bindings === undefined) return dispatch.physicalContext;
  const positionX = boundNumber(dispatch.params, bindings.positionXParameter);
  const positionY = boundNumber(dispatch.params, bindings.positionYParameter);
  const humanPresence = bindings.humanPresenceParameter === undefined
    ? undefined
    : dispatch.params[bindings.humanPresenceParameter];

  return {
    ...dispatch.physicalContext,
    commandedVelocityMps:
      boundNumber(dispatch.params, bindings.velocityParameter)
      ?? dispatch.physicalContext?.commandedVelocityMps,
    commandedForceNewtons:
      boundNumber(dispatch.params, bindings.forceParameter)
      ?? dispatch.physicalContext?.commandedForceNewtons,
    position: positionX !== undefined && positionY !== undefined
      ? { x: positionX, y: positionY }
      : dispatch.physicalContext?.position,
    humanPresenceDetected: typeof humanPresence === "boolean"
      ? humanPresence
      : dispatch.physicalContext?.humanPresenceDetected,
  };
}

export interface EdgeRunnerOptions {
  readonly runnerId: string;
  readonly admission: LocalAdmissionPolicy;
  readonly executor: EffectExecutor;
  readonly journal?: EdgeJournal;
  readonly now?: () => Date;
}

export class SintEdgeRunner {
  readonly journal: EdgeJournal;
  private readonly usedDispatchIds = new Set<string>();
  private readonly usedNonces = new Set<string>();

  constructor(private readonly options: EdgeRunnerOptions) {
    this.journal = options.journal ?? new EdgeJournal();
  }

  async run(
    packCandidate: unknown,
    dispatchCandidate: unknown,
  ): Promise<Result<EdgeRunReceipt, EdgeRunDenial>> {
    const packResult = verifySignedEffectPack(packCandidate);
    if (!packResult.ok) return this.denyUnknown(dispatchCandidate, "INVALID_PACK", packResult.error);
    const pack = packResult.value;

    const dispatchResult = verifySignedDispatchEnvelope(dispatchCandidate);
    if (!dispatchResult.ok) return this.denyUnknown(dispatchCandidate, "INVALID_DISPATCH", dispatchResult.error);
    const dispatch = dispatchResult.value;

    const preflight = this.preflight(pack, dispatch);
    if (!preflight.ok) {
      this.recordDenial(dispatch, preflight.error);
      return preflight;
    }
    const effect = preflight.value;

    this.usedDispatchIds.add(dispatch.dispatchId);
    this.usedNonces.add(dispatch.nonce);
    this.journal.append({
      event: "dispatch.accepted",
      dispatchId: dispatch.dispatchId,
      actionRef: dispatch.actionRef,
      details: {
        effectId: effect.effectId,
        packDigest: pack.digest,
        policyEventHash: dispatch.authorization.policyEventHash,
        approvalEventHash: dispatch.authorization.approvalEventHash,
      },
    });
    const startedAt = nowISO8601();
    this.journal.append({
      event: "effect.started",
      dispatchId: dispatch.dispatchId,
      actionRef: dispatch.actionRef,
      details: { effectId: effect.effectId },
    });

    const execution = await this.executeWithTimeout(dispatch, effect);
    if (!execution.ok) {
      const code = execution.error === "execution timed out"
        ? "EXECUTION_TIMEOUT"
        : "EXECUTOR_FAILED";
      const denied = { code, reason: execution.error } as const;
      this.recordExecutionFailure(dispatch, effect, denied);
      return err(denied);
    }

    const completedAt = nowISO8601();
    const sanitized = redactAndLimit(execution.value.output, effect);
    const event = execution.value.status === "completed"
      ? "effect.completed"
      : execution.value.status === "cancelled"
        ? "effect.cancelled"
        : "effect.failed";
    this.journal.append({
      event,
      dispatchId: dispatch.dispatchId,
      actionRef: dispatch.actionRef,
      details: {
        effectId: effect.effectId,
        status: execution.value.status,
        code: execution.value.code,
        outputTruncated: sanitized.outputTruncated,
        redactionCount: sanitized.redactionCount,
      },
    });

    return ok({
      dispatchId: dispatch.dispatchId,
      actionRef: dispatch.actionRef,
      runnerId: this.options.runnerId,
      packDigest: pack.digest,
      effectId: effect.effectId,
      status: execution.value.status,
      startedAt,
      completedAt,
      ...sanitized,
      code: execution.value.code,
      metrics: execution.value.metrics,
      journalHead: this.journal.headHash,
    });
  }

  private preflight(
    pack: SignedEffectPack,
    dispatch: SignedDispatchEnvelope,
  ): Result<EffectContract, EdgeRunDenial> {
    const now = this.options.now?.() ?? new Date();
    const admission = this.options.admission;

    if (!admission.trustedPackIssuers.includes(pack.issuer)) {
      return denial("UNTRUSTED_PACK", "pack issuer is not trusted locally");
    }
    if (
      admission.allowedPackDigests !== undefined
      && !admission.allowedPackDigests.includes(pack.digest)
    ) {
      return denial("UNTRUSTED_PACK", "pack digest is not admitted locally");
    }
    if (pack.expiresAt !== undefined && now >= new Date(pack.expiresAt)) {
      return denial("PACK_EXPIRED", "effect pack has expired");
    }
    if (!admission.trustedDispatchSigners.includes(dispatch.signer)) {
      return denial("UNTRUSTED_DISPATCHER", "dispatch signer is not trusted locally");
    }
    if (now >= new Date(dispatch.expiresAt) || now < new Date(dispatch.issuedAt)) {
      return denial("DISPATCH_EXPIRED", "dispatch is outside its validity window");
    }
    if (dispatch.runnerId !== this.options.runnerId) {
      return denial("WRONG_RUNNER", "dispatch is bound to a different runner");
    }
    if (this.usedDispatchIds.has(dispatch.dispatchId) || this.usedNonces.has(dispatch.nonce)) {
      return denial("REPLAY_DETECTED", "dispatch identifier or nonce has already been consumed");
    }
    if (dispatch.packId !== pack.packId || dispatch.packDigest !== pack.digest) {
      return denial("INVALID_DISPATCH", "dispatch does not bind the supplied effect pack");
    }

    const effect = pack.effects.find((candidate) => candidate.effectId === dispatch.effectId);
    if (effect === undefined) return denial("INVALID_DISPATCH", "effect is absent from the pack");
    if (admission.deniedEffectIds?.includes(effect.effectId) === true) {
      return denial("LOCAL_POLICY_DENIED", "effect is denied by local admission policy");
    }
    if (
      admission.allowedEffectIds !== undefined
      && !admission.allowedEffectIds.includes(effect.effectId)
    ) {
      return denial("LOCAL_POLICY_DENIED", "effect is not locally allowlisted");
    }
    if (
      admission.maximumTier !== undefined
      && TIER_ORDER[dispatch.authorization.assignedTier] > TIER_ORDER[admission.maximumTier]
    ) {
      return denial("LOCAL_POLICY_DENIED", "authorization tier exceeds the local ceiling");
    }
    if (
      TIER_ORDER[dispatch.authorization.assignedTier] < TIER_ORDER[effect.minimumTier]
    ) {
      return denial("INVALID_DISPATCH", "gateway tier is below the effect minimum");
    }
    if (
      admission.requireApprovalEvidenceFor?.includes(dispatch.authorization.assignedTier) === true
      && dispatch.authorization.approvalEventHash === undefined
    ) {
      return denial("APPROVAL_EVIDENCE_REQUIRED", "local policy requires approval evidence");
    }

    const token = dispatch.capabilityToken;
    if (
      admission.trustedCapabilityIssuers !== undefined
      && !admission.trustedCapabilityIssuers.includes(token.issuer)
    ) {
      return denial("CAPABILITY_REJECTED", "capability issuer is not trusted locally");
    }
    const tokenResult = validateCapabilityToken(token, {
      resource: effect.resource,
      action: effect.action,
      physicalContext: derivePhysicalContext(effect, dispatch),
      now,
    });
    if (!tokenResult.ok) {
      return denial("CAPABILITY_REJECTED", `capability validation failed: ${tokenResult.error}`);
    }

    const parameterError = validateParameters(effect, dispatch.params);
    if (parameterError !== undefined) return denial("PARAMETER_REJECTED", parameterError);
    return ok(effect);
  }

  private async executeWithTimeout(
    dispatch: SignedDispatchEnvelope,
    effect: EffectContract,
  ): Promise<Result<EffectExecutionOutput, string>> {
    const execution = Promise.resolve(this.options.executor({
      dispatchId: dispatch.dispatchId,
      actionRef: dispatch.actionRef,
      effect,
      params: dispatch.params,
      capabilityToken: dispatch.capabilityToken,
    })).then(
      (result) => result,
      (cause: unknown) => err(`executor rejected: ${cause instanceof Error ? cause.message : String(cause)}`),
    );
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve(err("execution timed out")),
        effect.maxDurationMs,
      );
      execution.then((result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  private recordDenial(dispatch: SignedDispatchEnvelope, denied: EdgeRunDenial): void {
    this.journal.append({
      event: "dispatch.denied",
      dispatchId: dispatch.dispatchId,
      actionRef: dispatch.actionRef,
      details: { code: denied.code, reason: denied.reason },
    });
  }

  private recordExecutionFailure(
    dispatch: SignedDispatchEnvelope,
    effect: EffectContract,
    denied: EdgeRunDenial,
  ): void {
    this.journal.append({
      event: "effect.failed",
      dispatchId: dispatch.dispatchId,
      actionRef: dispatch.actionRef,
      details: { effectId: effect.effectId, code: denied.code, reason: denied.reason },
    });
  }

  private denyUnknown(
    candidate: unknown,
    code: "INVALID_PACK" | "INVALID_DISPATCH",
    reason: string,
  ): Result<never, EdgeRunDenial> {
    const record = candidate && typeof candidate === "object"
      ? candidate as Record<string, unknown>
      : {};
    if (typeof record.dispatchId === "string" && typeof record.actionRef === "string") {
      this.journal.append({
        event: "dispatch.denied",
        dispatchId: record.dispatchId,
        actionRef: record.actionRef,
        details: { code, reason },
      });
    }
    return denial(code, reason);
  }
}
