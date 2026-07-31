/**
 * SINT Protocol — code-as-policy robot-agent guard.
 *
 * Guards the hierarchy used by robot coding agents:
 * fixed primitives -> agent-created skills -> generated task programs.
 */

import { ApprovalTier, RiskTier, type PolicyDecision, type SintCapabilityToken, type SintRequest } from "@pshkv/core";

export interface CodeAsPolicyMetadata {
  readonly programRef?: string;
  readonly programDigest?: string;
  readonly approvedProgramDigest?: string;
  readonly skillRef?: string;
  readonly skillDigest?: string;
  readonly approvedSkillDigest?: string;
  readonly primitiveSetRef?: string;
  readonly primitives?: readonly string[];
  readonly robotIds?: readonly string[];
  readonly trialRef?: string;
  readonly trialIndex?: number;
  readonly trialBudget?: number;
}

export interface CodeAsPolicyGuardResult {
  readonly verified: boolean;
  readonly violations: readonly string[];
  readonly severity: "low" | "medium" | "high";
  readonly metadata?: CodeAsPolicyMetadata;
}

export interface CodeAsPolicyGuardConfig {
  readonly allowedPrimitives: readonly string[];
  readonly requireProgramDigest?: boolean;
  readonly requireSkillDigest?: boolean;
  readonly maxTrialBudget?: number;
}

export interface CodeAsPolicyGuardPlugin {
  verify(
    request: SintRequest,
    token: SintCapabilityToken,
  ): CodeAsPolicyGuardResult;
}

const CODE_AS_POLICY_RESOURCES = [
  "engine://system2/plan",
  "engine://system2/execute",
  "engine://capsule/skill-library/register",
  "ros2:///joint_trajectory_controller/follow_joint_trajectory",
];

const SHA256_DIGEST_RE = /^digest:sha256:[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(record: Record<string, unknown>, key: string): readonly string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.every((item) => typeof item === "string") ? value : undefined;
}

function extractMetadata(params: Record<string, unknown>): CodeAsPolicyMetadata | undefined {
  const raw = params.codeAsPolicy;
  if (!isRecord(raw)) {
    return undefined;
  }

  return {
    programRef: stringValue(raw, "programRef"),
    programDigest: stringValue(raw, "programDigest"),
    approvedProgramDigest: stringValue(raw, "approvedProgramDigest"),
    skillRef: stringValue(raw, "skillRef"),
    skillDigest: stringValue(raw, "skillDigest"),
    approvedSkillDigest: stringValue(raw, "approvedSkillDigest"),
    primitiveSetRef: stringValue(raw, "primitiveSetRef"),
    primitives: stringArrayValue(raw, "primitives"),
    robotIds: stringArrayValue(raw, "robotIds"),
    trialRef: stringValue(raw, "trialRef"),
    trialIndex: numberValue(raw, "trialIndex"),
    trialBudget: numberValue(raw, "trialBudget"),
  };
}

function isCodeAsPolicyRequest(request: SintRequest): boolean {
  if (isRecord(request.params.codeAsPolicy)) {
    return true;
  }
  return CODE_AS_POLICY_RESOURCES.some((resource) => request.resource === resource);
}

function denyDecision(
  request: SintRequest,
  policyViolated: string,
  reason: string,
): PolicyDecision {
  return {
    requestId: request.requestId,
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    action: "deny",
    assignedTier: ApprovalTier.T2_ACT,
    assignedRisk: RiskTier.T2_STATEFUL,
    denial: {
      reason,
      policyViolated,
    },
  };
}

export class DefaultCodeAsPolicyGuard implements CodeAsPolicyGuardPlugin {
  private readonly allowedPrimitives: ReadonlySet<string>;
  private readonly requireProgramDigest: boolean;
  private readonly requireSkillDigest: boolean;
  private readonly maxTrialBudget: number | undefined;

  constructor(config: CodeAsPolicyGuardConfig) {
    this.allowedPrimitives = new Set(config.allowedPrimitives);
    this.requireProgramDigest = config.requireProgramDigest ?? true;
    this.requireSkillDigest = config.requireSkillDigest ?? true;
    this.maxTrialBudget = config.maxTrialBudget;
  }

  verify(request: SintRequest, _token: SintCapabilityToken): CodeAsPolicyGuardResult {
    if (!isCodeAsPolicyRequest(request)) {
      return {
        verified: true,
        violations: [],
        severity: "low",
      };
    }

    const metadata = extractMetadata(request.params);
    const violations: string[] = [];

    if (!metadata) {
      violations.push("codeAsPolicy metadata is required for generated robot program requests");
      return { verified: false, violations, severity: "high" };
    }

    if (this.requireProgramDigest) {
      if (!metadata.programDigest || !SHA256_DIGEST_RE.test(metadata.programDigest)) {
        violations.push("programDigest must be a digest:sha256 value");
      }
      if (
        metadata.approvedProgramDigest
        && metadata.programDigest
        && metadata.approvedProgramDigest !== metadata.programDigest
      ) {
        violations.push("programDigest does not match approvedProgramDigest");
      }
    }

    if (this.requireSkillDigest && metadata.skillRef) {
      if (!metadata.skillDigest || !SHA256_DIGEST_RE.test(metadata.skillDigest)) {
        violations.push("skillDigest must be a digest:sha256 value when skillRef is present");
      }
      if (
        metadata.approvedSkillDigest
        && metadata.skillDigest
        && metadata.approvedSkillDigest !== metadata.skillDigest
      ) {
        violations.push("skillDigest does not match approvedSkillDigest");
      }
    }

    if (!metadata.primitives || metadata.primitives.length === 0) {
      violations.push("primitives must name the fixed platform primitive vocabulary used");
    } else {
      const unapproved = metadata.primitives.filter((primitive) => !this.allowedPrimitives.has(primitive));
      if (unapproved.length > 0) {
        violations.push(`unapproved primitives: ${unapproved.join(", ")}`);
      }
    }

    if (metadata.robotIds && new Set(metadata.robotIds).size !== metadata.robotIds.length) {
      violations.push("robotIds must not contain duplicates");
    }

    if (
      this.maxTrialBudget !== undefined
      && metadata.trialBudget !== undefined
      && metadata.trialBudget > this.maxTrialBudget
    ) {
      violations.push(`trialBudget ${metadata.trialBudget} exceeds maximum ${this.maxTrialBudget}`);
    }

    if (
      metadata.trialIndex !== undefined
      && metadata.trialBudget !== undefined
      && metadata.trialIndex > metadata.trialBudget
    ) {
      violations.push(`trialIndex ${metadata.trialIndex} exceeds trialBudget ${metadata.trialBudget}`);
    }

    return {
      verified: violations.length === 0,
      violations,
      severity: violations.length === 0 ? "low" : "high",
      metadata,
    };
  }
}

export function decisionForCodeAsPolicyViolation(
  request: SintRequest,
  result: CodeAsPolicyGuardResult,
): PolicyDecision {
  const reason = `Code-as-policy guard violation: ${result.violations.join("; ")}`;
  const digestMismatch = result.violations.some((violation) => violation.includes("does not match"));
  return denyDecision(
    request,
    digestMismatch ? "CONSTRAINT_VIOLATION" : "CODE_AS_POLICY_GUARD",
    reason,
  );
}
