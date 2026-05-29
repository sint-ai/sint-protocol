/**
 * Guard profile registry for the managed-autonomy pre-gate.
 *
 * Guard providers translate external evidence into the verified `GuardState`
 * macro-net. They never trust self-reported agent health, and they never mint
 * external authorization internally.
 */

import { z } from "zod";
import {
  err,
  ok,
  type Result,
  type SintLedgerEvent,
  type SintRequest,
} from "@pshkv/core";
import type { GuardState } from "./autonomy-states.js";

export const AUTONOMY_DEFAULT_GUARD_PROFILE_ID = "default-permissive";

export const guardHysteresisConfigSchema = z.object({
  invalidHighThreshold: z.number().min(0).max(1).default(0.30),
  invalidLowThreshold: z.number().min(0).max(1).default(0.15),
  invalidLowDebounceEvents: z.number().int().min(1).default(3),
}).superRefine((value, ctx) => {
  if (value.invalidHighThreshold <= value.invalidLowThreshold) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["invalidHighThreshold"],
      message: "invalidHighThreshold must be greater than invalidLowThreshold",
    });
  }
});

export type GuardHysteresisConfig = z.infer<typeof guardHysteresisConfigSchema>;

export const externalAuthorizationSignalSchema = z.object({
  authorized: z.boolean(),
  source: z.string().min(1),
  evidenceRef: z.string().min(1).optional(),
}).strict();

export type ExternalAuthorizationSignal = z.infer<
  typeof externalAuthorizationSignalSchema
>;

export interface GuardContext {
  readonly agentId: string;
  readonly requestId: string;
  readonly guardProfileId: string;
  readonly recentLedgerEvents: readonly SintLedgerEvent[];
  readonly latestCsmlScore: number | null;
  readonly physicalContext?: SintRequest["physicalContext"];
  readonly executionContext?: SintRequest["executionContext"];
  readonly metacognitiveElapsedMs?: number;
  readonly assistedElapsedMs?: number;
  readonly maxMetacognitiveRecoveryMs?: number;
  readonly maxAssistedRecoveryMs?: number;
  readonly assistAvailable?: boolean;
  readonly externalAuthorization?: ExternalAuthorizationSignal;
  readonly signals?: Record<string, unknown>;
}

export interface GuardProvider {
  readonly id: string;
  evaluate(ctx: GuardContext): GuardState;
}

export type GuardRegistryError =
  | "INVALID_GUARD_PROVIDER"
  | "GUARD_PROFILE_NOT_FOUND"
  | "DUPLICATE_GUARD_PROFILE";

type HysteresisState = {
  readonly invalid: boolean;
  readonly lowDwellEvents: number;
};

export class CsmlInvalidHysteresis {
  private readonly states = new Map<string, HysteresisState>();
  private readonly config: GuardHysteresisConfig;

  constructor(config: Partial<GuardHysteresisConfig> = {}) {
    this.config = guardHysteresisConfigSchema.parse(config);
  }

  evaluate(key: string, csmlScore: number | null): boolean {
    const previous = this.states.get(key) ?? { invalid: false, lowDwellEvents: 0 };
    if (csmlScore === null) {
      this.states.set(key, previous);
      return previous.invalid;
    }

    if (csmlScore >= this.config.invalidHighThreshold) {
      this.states.set(key, { invalid: true, lowDwellEvents: 0 });
      return true;
    }

    if (!previous.invalid) {
      this.states.set(key, { invalid: false, lowDwellEvents: 0 });
      return false;
    }

    if (csmlScore <= this.config.invalidLowThreshold) {
      const lowDwellEvents = previous.lowDwellEvents + 1;
      const invalid = lowDwellEvents < this.config.invalidLowDebounceEvents;
      this.states.set(key, {
        invalid,
        lowDwellEvents: invalid ? lowDwellEvents : 0,
      });
      return invalid;
    }

    this.states.set(key, { invalid: true, lowDwellEvents: 0 });
    return true;
  }
}

export class GuardRegistry {
  private readonly providers = new Map<string, GuardProvider>();

  constructor(providers: readonly GuardProvider[] = [defaultPermissiveGuardProvider]) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: GuardProvider): Result<GuardProvider, GuardRegistryError> {
    if (!provider.id || typeof provider.evaluate !== "function") {
      return err("INVALID_GUARD_PROVIDER");
    }
    if (this.providers.has(provider.id)) {
      return err("DUPLICATE_GUARD_PROFILE");
    }
    this.providers.set(provider.id, provider);
    return ok(provider);
  }

  get(id: string): Result<GuardProvider, GuardRegistryError> {
    const provider = this.providers.get(id);
    return provider ? ok(provider) : err("GUARD_PROFILE_NOT_FOUND");
  }
}

function truthySignal(signals: Record<string, unknown> | undefined, key: string): boolean {
  return signals?.[key] === true;
}

function numericSignal(signals: Record<string, unknown> | undefined, key: string): number | null {
  const value = signals?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasLedgerEvent(ctx: GuardContext, eventType: string): boolean {
  return ctx.recentLedgerEvents.some((event) => event.eventType === eventType);
}

function externalAuthFromContext(ctx: GuardContext): boolean {
  const parsed = externalAuthorizationSignalSchema.safeParse(ctx.externalAuthorization);
  if (!parsed.success || !parsed.data.authorized) {
    return false;
  }
  return parsed.data.source === "human_operator"
    || parsed.data.source === "hardware_safety_controller";
}

function timeoutM(ctx: GuardContext): boolean {
  if (truthySignal(ctx.signals, "timeoutM")) {
    return true;
  }
  if (ctx.maxMetacognitiveRecoveryMs === undefined) {
    return false;
  }
  return (ctx.metacognitiveElapsedMs ?? 0) >= ctx.maxMetacognitiveRecoveryMs;
}

function timeoutA(ctx: GuardContext): boolean {
  if (truthySignal(ctx.signals, "timeoutA")) {
    return true;
  }
  if (ctx.maxAssistedRecoveryMs === undefined) {
    return false;
  }
  return (ctx.assistedElapsedMs ?? 0) >= ctx.maxAssistedRecoveryMs;
}

function makeProviderInvalidEvaluator(profileId: string): (ctx: GuardContext) => boolean {
  const hysteresis = new CsmlInvalidHysteresis();
  return (ctx) => hysteresis.evaluate(`${profileId}:${ctx.agentId}`, ctx.latestCsmlScore);
}

const ros2CsmlInvalid = makeProviderInvalidEvaluator("ros2");
const mcpCsmlInvalid = makeProviderInvalidEvaluator("mcp");

export const defaultPermissiveGuardProvider: GuardProvider = {
  id: AUTONOMY_DEFAULT_GUARD_PROFILE_ID,
  evaluate(ctx) {
    return {
      invalid: false,
      unsafeUnrecoverable: false,
      disagree: false,
      assistAvailable: ctx.assistAvailable === true,
      timeoutM: timeoutM(ctx),
      timeoutA: timeoutA(ctx),
      extAuth: externalAuthFromContext(ctx),
    };
  },
};

export const ros2GuardProvider: GuardProvider = {
  id: "ros2",
  evaluate(ctx) {
    const localizationDriftM = numericSignal(ctx.signals, "localizationDriftMeters");
    const velocity = ctx.physicalContext?.currentVelocityMps ?? 0;
    const force = ctx.physicalContext?.currentForceNewtons ?? 0;
    const envelopeBreach = truthySignal(ctx.signals, "safetyEnvelopeBreach")
      || (ctx.physicalContext?.humanDetected === true && (velocity > 0 || force > 0));

    return {
      invalid: ros2CsmlInvalid(ctx)
        || truthySignal(ctx.signals, "sensorMismatch")
        || truthySignal(ctx.signals, "localizationDrift")
        || (localizationDriftM !== null && localizationDriftM > 0.5)
        || hasLedgerEvent(ctx, "safety.anomaly.detected"),
      unsafeUnrecoverable: envelopeBreach
        || truthySignal(ctx.signals, "hardwareFault")
        || hasLedgerEvent(ctx, "safety.hardware.interlock.open")
        || hasLedgerEvent(ctx, "safety.estop.triggered"),
      disagree: truthySignal(ctx.signals, "swarmMapConflict"),
      assistAvailable: ctx.assistAvailable === true
        || truthySignal(ctx.signals, "assistAvailable"),
      timeoutM: timeoutM(ctx),
      timeoutA: timeoutA(ctx),
      extAuth: externalAuthFromContext(ctx),
    };
  },
};

export const mcpGuardProvider: GuardProvider = {
  id: "mcp",
  evaluate(ctx) {
    return {
      invalid: mcpCsmlInvalid(ctx)
        || truthySignal(ctx.signals, "schemaInvalidArgs")
        || truthySignal(ctx.signals, "retrievalDivergence"),
      unsafeUnrecoverable: truthySignal(ctx.signals, "execPattern")
        || truthySignal(ctx.signals, "credentialExfilPattern")
        || truthySignal(ctx.signals, "credentialExfil"),
      disagree: truthySignal(ctx.signals, "verifierAgentRejection"),
      assistAvailable: ctx.assistAvailable === true
        || truthySignal(ctx.signals, "assistAvailable"),
      timeoutM: timeoutM(ctx),
      timeoutA: timeoutA(ctx),
      extAuth: externalAuthFromContext(ctx),
    };
  },
};

export function createDefaultGuardRegistry(): GuardRegistry {
  return new GuardRegistry([
    defaultPermissiveGuardProvider,
    ros2GuardProvider,
    mcpGuardProvider,
  ]);
}
