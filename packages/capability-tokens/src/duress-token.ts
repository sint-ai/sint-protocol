import {
  type CapabilityTokenError,
  type Result,
  type SintCapabilityToken,
  err,
  ok,
} from "@pshkv/core";

export interface DuressEvidenceEscrow {
  readonly evidenceHash: string;
  readonly judicialPublicKeyRef: string;
  readonly encryptedEvidenceKey: string;
}

export interface DuressControlProfile {
  readonly survivorId: string;
  readonly trustedPartyId: string;
  readonly requiresDualApproval: boolean;
}

export interface DuressCapabilityToken {
  readonly baseToken: SintCapabilityToken;
  readonly duressControl: DuressControlProfile;
  readonly evidenceEscrow: DuressEvidenceEscrow;
  readonly createdAt: string;
}

export interface DuressAccessLog {
  readonly timestamp: string;
  readonly actorId: string;
  readonly action: "unlock" | "lock" | "disable_alarm" | "enable_alarm" | "revoke_token";
  readonly sourceNetwork?: string;
  readonly approvedBy?: readonly string[];
}

export interface CoercionDetectionResult {
  readonly coercionDetected: boolean;
  readonly riskScore: number;
  readonly reasons: readonly string[];
}

export interface CoercionDetectionOptions {
  readonly lookbackMs?: number;
  readonly repeatedAttemptsThreshold?: number;
}

const ISO8601_MICRO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function createDuressCapabilityToken(
  baseToken: SintCapabilityToken,
  profile: DuressControlProfile,
  escrow: DuressEvidenceEscrow,
  createdAt: string = nowIso8601Micros(),
): Result<DuressCapabilityToken, CapabilityTokenError> {
  if (!profile.survivorId || !profile.trustedPartyId) {
    return err("MALFORMED_TOKEN");
  }
  if (profile.survivorId === profile.trustedPartyId) {
    return err("MALFORMED_TOKEN");
  }
  if (!escrow.evidenceHash || !escrow.judicialPublicKeyRef || !escrow.encryptedEvidenceKey) {
    return err("MALFORMED_TOKEN");
  }
  if (!ISO8601_MICRO.test(createdAt)) {
    return err("MALFORMED_TOKEN");
  }
  if (!baseToken.revocable) {
    return err("INSUFFICIENT_PERMISSIONS");
  }

  return ok({
    baseToken,
    duressControl: profile,
    evidenceEscrow: escrow,
    createdAt,
  });
}

export function validateDuressResolution(
  token: DuressCapabilityToken,
  approvers: readonly string[],
): Result<true, CapabilityTokenError> {
  if (!token.duressControl.requiresDualApproval) {
    return ok(true);
  }
  const unique = new Set(approvers);
  if (!unique.has(token.duressControl.survivorId)) {
    return err("INSUFFICIENT_PERMISSIONS");
  }
  if (!unique.has(token.duressControl.trustedPartyId)) {
    return err("INSUFFICIENT_PERMISSIONS");
  }
  return ok(true);
}

export function detectCoercion(
  logs: readonly DuressAccessLog[],
  options: CoercionDetectionOptions = {},
): CoercionDetectionResult {
  const lookbackMs = options.lookbackMs ?? 15 * 60 * 1000;
  const repeatedAttemptsThreshold = options.repeatedAttemptsThreshold ?? 3;
  const reasons: string[] = [];

  if (logs.length === 0) {
    return { coercionDetected: false, riskScore: 0, reasons };
  }

  const newestMs = Math.max(...logs.map((entry) => new Date(entry.timestamp).getTime()));
  const activeWindow = logs.filter(
    (entry) => newestMs - new Date(entry.timestamp).getTime() <= lookbackMs,
  );

  const actorCounts = new Map<string, number>();
  const networkSet = new Set<string>();
  for (const entry of activeWindow) {
    actorCounts.set(entry.actorId, (actorCounts.get(entry.actorId) ?? 0) + 1);
    if (entry.sourceNetwork) {
      networkSet.add(entry.sourceNetwork);
    }
  }

  const maxActorAttempts = Math.max(...actorCounts.values());
  let riskScore = 0;

  if (maxActorAttempts >= repeatedAttemptsThreshold) {
    riskScore += 0.45;
    reasons.push("Repeated high-risk actions by a single actor in short window");
  }

  if (networkSet.size >= 3) {
    riskScore += 0.35;
    reasons.push("Action stream originated from multiple networks in short window");
  }

  const revocationAttempts = activeWindow.filter(
    (entry) => entry.action === "revoke_token",
  ).length;
  if (revocationAttempts > 0) {
    riskScore += 0.3;
    reasons.push("Revocation attempts detected during active duress window");
  }

  const cappedScore = Math.min(1, riskScore);
  return {
    coercionDetected: cappedScore >= 0.5,
    riskScore: cappedScore,
    reasons,
  };
}

function nowIso8601Micros(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

