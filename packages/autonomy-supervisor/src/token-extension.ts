/**
 * Capability-token autonomy policy extension.
 *
 * This is additive: tokens without `autonomyPolicy` are treated as legacy
 * stable authority with the default permissive guard profile.
 */

import { z } from "zod";
import {
  err,
  ok,
  type Result,
  type SintCapabilityToken,
} from "@pshkv/core";
import { AUTONOMY_DEFAULT_GUARD_PROFILE_ID } from "./guard-registry.js";

export interface AutonomyPolicy {
  readonly requiredState: "stable";
  readonly guardProfileId: string;
  readonly maxMetacognitiveRecoveryMs?: number;
  readonly maxAssistedRecoveryMs?: number;
  readonly assistanceQuorum?: {
    readonly required: number;
    readonly verifierTypes: readonly string[];
  };
  readonly regulatedController: "human_operator" | "hardware_safety_controller";
  readonly failClosed: true;
}

export const autonomyPolicySchema = z.object({
  requiredState: z.literal("stable"),
  guardProfileId: z.string().min(1).max(128),
  maxMetacognitiveRecoveryMs: z.number().int().positive().optional(),
  maxAssistedRecoveryMs: z.number().int().positive().optional(),
  assistanceQuorum: z.object({
    required: z.number().int().min(1),
    verifierTypes: z.array(z.string().min(1).max(128)).min(1),
  }).strict().optional(),
  regulatedController: z.enum([
    "human_operator",
    "hardware_safety_controller",
  ]),
  failClosed: z.literal(true),
}).strict();

export type ValidatedAutonomyPolicy = z.infer<typeof autonomyPolicySchema>;

export type AutonomyPolicyValidationError =
  | "AUTONOMY_POLICY_ABSENT"
  | "AUTONOMY_POLICY_INVALID";

export function validateAutonomyPolicy(
  input: unknown,
): Result<AutonomyPolicy, AutonomyPolicyValidationError> {
  const parsed = autonomyPolicySchema.safeParse(input);
  if (!parsed.success) {
    return err("AUTONOMY_POLICY_INVALID");
  }
  return ok(parsed.data);
}

export function getTokenAutonomyPolicy(
  token: SintCapabilityToken,
): Result<AutonomyPolicy, AutonomyPolicyValidationError> {
  const candidate = (token as SintCapabilityToken & {
    readonly autonomyPolicy?: unknown;
  }).autonomyPolicy;

  if (candidate === undefined) {
    return err("AUTONOMY_POLICY_ABSENT");
  }
  return validateAutonomyPolicy(candidate);
}

export function defaultAutonomyPolicy(): AutonomyPolicy {
  return {
    requiredState: "stable",
    guardProfileId: AUTONOMY_DEFAULT_GUARD_PROFILE_ID,
    regulatedController: "human_operator",
    failClosed: true,
  };
}
