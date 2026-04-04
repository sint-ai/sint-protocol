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
 */

import type { SintRequest } from "@sint/core";

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
