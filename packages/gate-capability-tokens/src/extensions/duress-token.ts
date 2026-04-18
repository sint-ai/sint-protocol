/**
 * SINT Duress Token — Domestic Violence Protection Mechanism
 *
 * Provides survivor-controlled access to smart home devices with cryptographic
 * protections against coercion and unauthorized revocation.
 *
 * @module @pshkv/gate-capability-tokens/duress-token
 */

import type { CapabilityToken } from "../capability-token.js";
import { ApprovalTier } from "@pshkv/core";

/**
 * Duress context indicators.
 * Used to detect when a survivor may be under coercion.
 */
export interface DuressContext {
  /** Unusual access times (e.g., 3am when victim typically asleep) */
  unusualTime: boolean;

  /** Rapid successive access attempts */
  rapidAccess: boolean;

  /** Access from unexpected location */
  unexpectedLocation: boolean;

  /** Pattern breaks from normal behavior */
  patternAnomaly: boolean;

  /** Manual duress signal triggered */
  manualDuress: boolean;
}

/**
 * Trusted third party for split control.
 * Could be: advocate, counselor, attorney, family member, shelter.
 */
export interface TrustedParty {
  /** DID of trusted party */
  did: string;

  /** Type of trusted party */
  role: "advocate" | "counselor" | "attorney" | "family" | "shelter" | "law-enforcement";

  /** Contact information (encrypted) */
  contactInfo: string;

  /** Public key for evidence encryption */
  publicKey: string;
}

/**
 * Evidence escrow for judicial access.
 * Encrypted evidence can only be decrypted by judicial order.
 */
export interface EvidenceEscrow {
  /** Hash of evidence bundle (photos, videos, logs) */
  evidenceHash: string;

  /** Encrypted evidence key (only judicial key can decrypt) */
  encryptedKey: string;

  /** Judicial public key used for encryption */
  judicialPublicKey: string;

  /** Timestamp of escrow creation */
  timestamp: Date;

  /** Evidence type description */
  evidenceType: "photos" | "videos" | "audio" | "logs" | "messages";
}

/**
 * Duress Token extension for capability tokens.
 *
 * Key features:
 * - Survivor-only cryptographic key (abuser cannot revoke)
 * - Split control (survivor + trusted party both required for critical actions)
 * - Evidence escrow (encrypted, judicial override only)
 * - Coercion detection (access pattern analysis)
 * - Device-level protections (locks, cameras, alarms)
 */
export interface DuressTokenExtension {
  /** Survivor DID (token owner) */
  survivorDID: string;

  /** Survivor's cryptographic key (only survivor can revoke) */
  survivorKey: string;

  /** Trusted third party for split control */
  trustedParty: TrustedParty;

  /** Split control enabled (both keys required for revocation) */
  splitControl: boolean;

  /** Evidence escrow (optional) */
  evidenceEscrow?: EvidenceEscrow;

  /** Devices under protection */
  protectedDevices: {
    /** Device type */
    type: "lock" | "camera" | "alarm" | "light" | "thermostat";

    /** Device identifier */
    deviceId: string;

    /** Protection level */
    protection: "full-lock" | "survivor-only" | "alert-on-access";
  }[];

  /** Duress detection enabled */
  duressDetection: boolean;

  /** Access log for pattern analysis */
  accessLog: {
    timestamp: Date;
    action: string;
    deviceId: string;
    success: boolean;
    duressContext: DuressContext;
  }[];

  /** Creation timestamp */
  createdAt: Date;

  /** Expiration (long-lived, typically 1+ years) */
  expiresAt?: Date;
}

/**
 * Duress Token = Capability Token + Duress Extension.
 */
export interface DuressToken extends CapabilityToken {
  duress: DuressTokenExtension;
}

/**
 * Create a Duress Token for domestic violence protection.
 *
 * @param survivorDID - Survivor's decentralized identifier
 * @param trustedParty - Trusted third party for split control
 * @param protectedDevices - Devices to protect
 * @param options - Additional options
 * @returns Duress Token for Policy Gateway
 *
 * @example
 * ```typescript
 * const duressToken = createDuressToken(
 *   'did:key:survivor_abc',
 *   {
 *     did: 'did:key:advocate_xyz',
 *     role: 'advocate',
 *     contactInfo: '<encrypted>',
 *     publicKey: '<advocate-public-key>',
 *   },
 *   [
 *     { type: 'lock', deviceId: 'front-door', protection: 'full-lock' },
 *     { type: 'camera', deviceId: 'bedroom-cam', protection: 'survivor-only' },
 *     { type: 'alarm', deviceId: 'panic-button', protection: 'survivor-only' },
 *   ],
 *   {
 *     splitControl: true,
 *     duressDetection: true,
 *     validYears: 2,
 *   }
 * );
 * ```
 */
export function createDuressToken(
  survivorDID: string,
  trustedParty: TrustedParty,
  protectedDevices: DuressTokenExtension["protectedDevices"],
  options?: {
    splitControl?: boolean;
    duressDetection?: boolean;
    evidenceEscrow?: Omit<EvidenceEscrow, "timestamp">;
    validYears?: number;
  }
): Partial<DuressToken> {
  const now = new Date();
  const validYears = options?.validYears ?? 2;
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + validYears);

  // Generate survivor-only key (in production, use cryptographic key generation)
  const survivorKey = `survivor-${Date.now()}-${Math.random().toString(36).substring(2)}`;

  return {
    subject: survivorDID,
    resource: `duress://${survivorDID}/*`, // All devices under survivor's protection
    actions: ["lock", "unlock", "arm", "disarm", "record", "alert"],
    tier: ApprovalTier.T2_ACT, // Duress actions require immediate execution
    issuedAt: now,
    expiresAt,
    duress: {
      survivorDID,
      survivorKey,
      trustedParty,
      splitControl: options?.splitControl ?? true,
      evidenceEscrow: options?.evidenceEscrow
        ? { ...options.evidenceEscrow, timestamp: now }
        : undefined,
      protectedDevices,
      duressDetection: options?.duressDetection ?? true,
      accessLog: [],
      createdAt: now,
      expiresAt,
    },
  };
}

/**
 * Detect coercion based on access pattern analysis.
 *
 * @param accessLog - Recent access attempts
 * @param baselinePattern - Normal access pattern for this survivor
 * @returns Duress context with indicators
 *
 * @example
 * ```typescript
 * const duressContext = detectCoercion(token.duress.accessLog, {
 *   typicalAccessHours: [7, 8, 9, 17, 18, 19, 20, 21],
 *   typicalDevices: ['front-door', 'bedroom-cam'],
 *   typicalLocation: { lat: 37.7749, lon: -122.4194 },
 * });
 *
 * if (duressContext.rapidAccess || duressContext.unusualTime) {
 *   // Alert trusted party
 *   notifyTrustedParty(token.duress.trustedParty);
 * }
 * ```
 */
export function detectCoercion(
  accessLog: DuressTokenExtension["accessLog"],
  baselinePattern: {
    typicalAccessHours: number[];
    typicalDevices: string[];
    typicalLocation?: { lat: number; lon: number };
  }
): DuressContext {
  const recentAccess = accessLog.slice(-10); // Last 10 attempts

  // Check for unusual access times
  const unusualTime = recentAccess.some((log) => {
    const hour = log.timestamp.getHours();
    return !baselinePattern.typicalAccessHours.includes(hour);
  });

  // Check for rapid successive access (>5 attempts in <2 minutes)
  const rapidAccess =
    recentAccess.length >= 5 &&
    recentAccess[recentAccess.length - 1].timestamp.getTime() -
      recentAccess[recentAccess.length - 5].timestamp.getTime() <
      2 * 60 * 1000;

  // Check for unexpected devices
  const unexpectedLocation = recentAccess.some(
    (log) => !baselinePattern.typicalDevices.includes(log.deviceId)
  );

  // Pattern anomaly: multiple failed attempts followed by success
  const patternAnomaly =
    recentAccess.filter((log) => !log.success).length >= 3 &&
    recentAccess[recentAccess.length - 1].success;

  // Manual duress (would be triggered by survivor via panic button)
  const manualDuress = recentAccess.some((log) => log.duressContext.manualDuress);

  return {
    unusualTime,
    rapidAccess,
    unexpectedLocation,
    patternAnomaly,
    manualDuress,
  };
}

/**
 * Verify Duress Token ownership (survivor-only key check).
 *
 * @param token - Duress Token
 * @param providedKey - Key provided by accessor
 * @returns true if key matches survivor key
 */
export function verifySurvivorKey(token: DuressToken, providedKey: string): boolean {
  // In production, use cryptographic signature verification
  return token.duress.survivorKey === providedKey;
}

/**
 * Revoke Duress Token (requires split control if enabled).
 *
 * @param token - Duress Token
 * @param survivorKey - Survivor's key
 * @param trustedPartyKey - Trusted party's key (required if split control enabled)
 * @returns Revocation proof
 *
 * @example
 * ```typescript
 * // Split control enabled: both keys required
 * const revocation = revokeDuressToken(
 *   token,
 *   survivorKey,
 *   trustedPartyKey  // Required for split control
 * );
 *
 * if (revocation.success) {
 *   console.log('Token revoked by survivor and trusted party');
 * }
 * ```
 */
export function revokeDuressToken(
  token: DuressToken,
  survivorKey: string,
  trustedPartyKey?: string
): {
  success: boolean;
  revokedAt?: Date;
  revokedBy?: string[];
  proof?: string;
  error?: string;
} {
  // Verify survivor key
  if (!verifySurvivorKey(token, survivorKey)) {
    return {
      success: false,
      error: "Invalid survivor key",
    };
  }

  // Check if split control enabled
  if (token.duress.splitControl) {
    if (!trustedPartyKey) {
      return {
        success: false,
        error: "Split control enabled: trusted party key required",
      };
    }

    // In production: verify trusted party's cryptographic signature
    // For now, placeholder check
    if (trustedPartyKey.length < 10) {
      return {
        success: false,
        error: "Invalid trusted party key",
      };
    }
  }

  const revokedAt = new Date();
  const revokedBy = [token.duress.survivorDID];
  if (trustedPartyKey) {
    revokedBy.push(token.duress.trustedParty.did);
  }

  // Generate revocation proof (in production: cryptographic signature)
  const proof = Buffer.from(
    JSON.stringify({
      tokenId: token.id,
      revokedAt: revokedAt.toISOString(),
      revokedBy,
    })
  ).toString("base64");

  return {
    success: true,
    revokedAt,
    revokedBy,
    proof,
  };
}

/**
 * Log access attempt for duress detection.
 *
 * @param token - Duress Token
 * @param action - Action attempted
 * @param deviceId - Device accessed
 * @param success - Whether access succeeded
 * @param manualDuress - Manual duress signal (panic button)
 * @returns Updated token with logged access
 */
export function logDuressAccess(
  token: DuressToken,
  action: string,
  deviceId: string,
  success: boolean,
  manualDuress: boolean = false
): DuressToken {
  const now = new Date();

  // Detect duress based on current access pattern
  const duressContext = detectCoercion(token.duress.accessLog, {
    typicalAccessHours: [7, 8, 9, 17, 18, 19, 20, 21], // Typical hours (7am-9pm)
    typicalDevices: token.duress.protectedDevices.map((d) => d.deviceId),
  });

  // Override with manual duress if triggered
  if (manualDuress) {
    duressContext.manualDuress = true;
  }

  // Add to access log
  token.duress.accessLog.push({
    timestamp: now,
    action,
    deviceId,
    success,
    duressContext,
  });

  // Keep only last 100 entries
  if (token.duress.accessLog.length > 100) {
    token.duress.accessLog = token.duress.accessLog.slice(-100);
  }

  return token;
}

/**
 * Check if access should be blocked due to duress indicators.
 *
 * @param token - Duress Token
 * @param action - Action being attempted
 * @param deviceId - Device being accessed
 * @returns true if access should be blocked
 */
export function shouldBlockDuressAccess(
  token: DuressToken,
  action: string,
  deviceId: string
): boolean {
  if (!token.duress.duressDetection) {
    return false; // Duress detection disabled
  }

  // Get device protection level
  const device = token.duress.protectedDevices.find((d) => d.deviceId === deviceId);
  if (!device) {
    return false; // Device not protected
  }

  // Full-lock devices: always require survivor key
  if (device.protection === "full-lock") {
    // In production: check that current accessor has survivor key
    // For now, allow (would be enforced by verifySurvivorKey in gateway)
    return false;
  }

  // Detect duress from access log
  const recentLog = token.duress.accessLog.slice(-10);
  if (recentLog.length === 0) {
    return false; // No history yet
  }

  const duressContext = detectCoercion(recentLog, {
    typicalAccessHours: [7, 8, 9, 17, 18, 19, 20, 21],
    typicalDevices: token.duress.protectedDevices.map((d) => d.deviceId),
  });

  // Block if multiple duress indicators present
  const duressScore =
    (duressContext.unusualTime ? 1 : 0) +
    (duressContext.rapidAccess ? 2 : 0) +
    (duressContext.unexpectedLocation ? 1 : 0) +
    (duressContext.patternAnomaly ? 2 : 0) +
    (duressContext.manualDuress ? 10 : 0);

  // Block if duress score >= 3 (or manual duress triggered)
  return duressScore >= 3;
}
