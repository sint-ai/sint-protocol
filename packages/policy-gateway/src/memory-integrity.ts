/**
 * SINT Protocol — ASI06 Memory Integrity Check.
 *
 * Detects signs of memory/context poisoning in agent requests.
 * Checks recentActions history for anomalies:
 * 1. Impossible action sequences (action X immediately after mutually exclusive action Y)
 * 2. Suspiciously high repetition (same action >N times in a row → replay attack)
 * 3. Unauthorized privilege claims in recent history strings ("I was authorized to...", "admin approved")
 * 4. History length anomalies (recentActions > maxHistoryLength = 50)
 * 5. Timestamp rollback in requestId (UUIDv7 timestamp should be monotonic)
 * 6. Cross-session continuity claims (hallucinated/injected prior-session references)
 * 7. Credential read funnel pattern (≥3 credential/secret/key reads → any write within last 10)
 * 8. Action velocity loop (>15 actions with last 5 all on identical resource → hallucination loop)
 */

import type { SintRequest } from "@pshkv/core";

export interface MemoryIntegrityResult {
  readonly poisoned: boolean;
  readonly anomalies: readonly string[]; // descriptions of detected anomalies
  readonly severity: "low" | "medium" | "high";
}

export interface MemoryIntegrityPlugin {
  check(request: SintRequest): MemoryIntegrityResult;
}

/** Patterns that indicate unauthorized privilege claims in history strings. */
const PRIVILEGE_CLAIM_PATTERNS: readonly RegExp[] = [
  /i\s+was\s+authorized\s+to/i,
  /admin\s+approved/i,
  /operator\s+approved/i,
  /previously\s+authorized/i,
  /granted\s+(full\s+)?access/i,
  /elevated\s+(privilege|permission|access)/i,
  /root\s+(access\s+)?granted/i,
  /security\s+(bypass|override)\s+(approved|granted)/i,
];

/**
 * Phrases that indicate hallucinated or injected cross-session continuity claims.
 * These are patterns injected to make the agent believe it has prior authorizations.
 */
const CROSS_SESSION_CONTINUITY_PATTERNS: readonly RegExp[] = [
  /from\s+session/i,
  /previous\s+context/i,
  /earlier\s+approved/i,
  /prior\s+session/i,
  /in\s+the\s+last\s+session/i,
  /as\s+(previously|earlier)\s+(established|confirmed|agreed)/i,
];

/**
 * Keyword fragments that indicate reads targeting sensitive credential resources.
 * Used for the credential-read-funnel pattern detection.
 */
const CREDENTIAL_READ_KEYWORDS: readonly string[] = [
  "credential",
  "secret",
  "key",
  "token",
  "password",
  "passwd",
  "apikey",
  "api_key",
  "private",
  "cert",
];

/** Mutually exclusive action pair definitions (action A cannot follow action B). */
const IMPOSSIBLE_SEQUENCES: readonly [string, string][] = [
  ["connect", "disconnect"],
  ["start", "stop"],
  ["lock", "unlock"],
  ["open", "close"],
  ["enable", "disable"],
];

function isImpossibleSequence(history: readonly string[]): string | null {
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]?.toLowerCase() ?? "";
    const curr = history[i]?.toLowerCase() ?? "";
    for (const [a, b] of IMPOSSIBLE_SEQUENCES) {
      if (prev.includes(b) && curr.includes(a)) {
        return `Impossible action sequence: "${history[i - 1]}" immediately followed by "${history[i]}"`;
      }
    }
  }
  return null;
}

function detectRepetition(
  history: readonly string[],
  maxRepetitions: number,
): string | null {
  if (history.length < maxRepetitions) {
    return null;
  }
  // Check for runs of identical actions
  let runLength = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i] === history[i - 1]) {
      runLength++;
      if (runLength > maxRepetitions) {
        return `Suspicious repetition: action "${history[i]}" repeated ${runLength} times consecutively`;
      }
    } else {
      runLength = 1;
    }
  }
  return null;
}

function detectPrivilegeClaims(history: readonly string[]): string | null {
  for (const entry of history) {
    for (const pattern of PRIVILEGE_CLAIM_PATTERNS) {
      if (pattern.test(entry)) {
        return `Unauthorized privilege claim in history: "${entry}"`;
      }
    }
  }
  return null;
}

/**
 * Check 6: Cross-session continuity claims.
 * Detects hallucinated references to prior sessions or pre-existing authorizations.
 */
function detectCrossSessionContinuity(history: readonly string[]): string | null {
  for (const entry of history) {
    for (const pattern of CROSS_SESSION_CONTINUITY_PATTERNS) {
      if (pattern.test(entry)) {
        return `Cross-session continuity claim detected in history: "${entry}"`;
      }
    }
  }
  return null;
}

/**
 * Check 7: Credential read funnel pattern.
 * Detects ≥3 reads of credential/secret/key resources followed by any write within the last 10 actions.
 */
function detectCredentialReadFunnel(history: readonly string[]): string | null {
  const window = history.slice(-10);
  const lowered = window.map((e) => e.toLowerCase());

  // Find the last write action index
  const lastWriteIdx = lowered.reduceRight((acc, entry, idx) => {
    if (acc === -1 && (entry.includes("write") || entry.includes("publish") || entry.startsWith("write"))) {
      return idx;
    }
    return acc;
  }, -1);

  if (lastWriteIdx === -1) return null;

  // Count credential reads before the last write
  let credentialReadCount = 0;
  for (let i = 0; i < lastWriteIdx; i++) {
    const entry = lowered[i] ?? "";
    if (
      (entry.includes("read") || entry.includes("get") || entry.includes("fetch") || entry.includes("subscribe")) &&
      CREDENTIAL_READ_KEYWORDS.some((kw) => entry.includes(kw))
    ) {
      credentialReadCount++;
    }
  }

  if (credentialReadCount >= 3) {
    return `Credential read funnel detected: ${credentialReadCount} credential/secret reads followed by a write action within last 10 actions`;
  }
  return null;
}

/**
 * Check 8: Action velocity loop.
 * Detects when the last 5 actions all reference the same resource (memory loop / hallucination loop).
 * Only triggered when total history length > 15.
 */
function detectActionVelocityLoop(history: readonly string[]): string | null {
  if (history.length <= 15) return null;

  const tail = history.slice(-5);
  if (tail.length < 5) return null;

  // Extract the resource portion from each action (e.g. "read:/secrets/db" → "/secrets/db")
  // Heuristic: split on first ':' or space and use the second part as the resource identifier
  function extractResource(action: string): string {
    const colonIdx = action.indexOf(":");
    if (colonIdx !== -1) return action.slice(colonIdx + 1);
    const spaceIdx = action.indexOf(" ");
    if (spaceIdx !== -1) return action.slice(spaceIdx + 1);
    return action;
  }

  const resources = tail.map(extractResource);
  const first = resources[0];
  if (first !== undefined && resources.every((r) => r === first)) {
    return `Action velocity loop detected: last 5 actions all target identical resource "${first}" (${history.length} total actions)`;
  }
  return null;
}

/**
 * Extract the timestamp from a UUIDv7 (milliseconds since Unix epoch).
 * UUIDv7 format: tttttttt-tttt-7xxx-xxxx-xxxxxxxxxxxx
 * First 48 bits are millisecond timestamp.
 */
function uuidV7TimestampMs(uuid: string): number | null {
  // Basic UUID format validation
  const clean = uuid.replace(/-/g, "");
  if (clean.length !== 32) {
    return null;
  }
  // Version must be 7
  if (clean[12] !== "7") {
    return null;
  }
  // First 12 hex chars = 48-bit timestamp in milliseconds
  const tsHex = clean.slice(0, 12);
  return parseInt(tsHex, 16);
}

export class DefaultMemoryIntegrityChecker implements MemoryIntegrityPlugin {
  private readonly maxHistoryLength: number;
  private readonly maxRepetitions: number;
  private lastSeenTimestampMs: number | null = null;

  constructor(config?: { maxHistoryLength?: number; maxRepetitions?: number }) {
    this.maxHistoryLength = config?.maxHistoryLength ?? 50;
    this.maxRepetitions = config?.maxRepetitions ?? 5;
  }

  check(request: SintRequest): MemoryIntegrityResult {
    const anomalies: string[] = [];
    let highSeverity = false;
    let mediumSeverity = false;

    const history = request.recentActions ?? [];

    // Fast path: no history to analyze — skip all pattern checks.
    // Only run the UUIDv7 monotonicity check (stateful, always relevant).
    if (history.length === 0) {
      const currentTs = uuidV7TimestampMs(request.requestId);
      if (currentTs !== null && this.lastSeenTimestampMs !== null) {
        if (currentTs < this.lastSeenTimestampMs) {
          return {
            poisoned: true,
            anomalies: [`UUIDv7 timestamp rollback: ${currentTs} < previous ${this.lastSeenTimestampMs}`],
            severity: "high",
          };
        }
      }
      if (currentTs !== null) this.lastSeenTimestampMs = currentTs;
      return { poisoned: false, anomalies: [], severity: "low" };
    }

    // Check 4: History length overflow
    if (history.length > this.maxHistoryLength) {
      anomalies.push(
        `History length anomaly: ${history.length} entries exceeds max ${this.maxHistoryLength}`,
      );
      mediumSeverity = true;
    }

    // Check 3: Unauthorized privilege claims (high severity)
    const privilegeClaim = detectPrivilegeClaims(history);
    if (privilegeClaim !== null) {
      anomalies.push(privilegeClaim);
      highSeverity = true;
    }

    // Check 2: Suspicious repetition (medium severity)
    const repetition = detectRepetition(history, this.maxRepetitions);
    if (repetition !== null) {
      anomalies.push(repetition);
      mediumSeverity = true;
    }

    // Check 1: Impossible action sequences (low severity)
    const impossible = isImpossibleSequence(history);
    if (impossible !== null) {
      anomalies.push(impossible);
    }

    // Check 6: Cross-session continuity claims (high severity)
    const crossSession = detectCrossSessionContinuity(history);
    if (crossSession !== null) {
      anomalies.push(crossSession);
      highSeverity = true;
    }

    // Check 7: Credential read funnel (high severity)
    const credFunnel = detectCredentialReadFunnel(history);
    if (credFunnel !== null) {
      anomalies.push(credFunnel);
      highSeverity = true;
    }

    // Check 8: Action velocity loop (high severity)
    const velocityLoop = detectActionVelocityLoop(history);
    if (velocityLoop !== null) {
      anomalies.push(velocityLoop);
      highSeverity = true;
    }

    // Check 5: UUIDv7 timestamp monotonicity (high severity)
    const currentTs = uuidV7TimestampMs(request.requestId);
    if (currentTs !== null && this.lastSeenTimestampMs !== null) {
      if (currentTs < this.lastSeenTimestampMs) {
        anomalies.push(
          `Timestamp rollback detected: requestId timestamp ${currentTs}ms < previous ${this.lastSeenTimestampMs}ms`,
        );
        highSeverity = true;
      }
    }
    if (currentTs !== null) {
      this.lastSeenTimestampMs = currentTs;
    }

    const poisoned = anomalies.length > 0;
    const severity: "low" | "medium" | "high" = highSeverity
      ? "high"
      : mediumSeverity
        ? "medium"
        : "low";

    return { poisoned, anomalies, severity };
  }
}
