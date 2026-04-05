/**
 * Evidence HUD — real-time evidence ledger viewer.
 *
 * Connects to the SINT gateway's SSE stream and maintains
 * a rolling window of evidence entries for the holographic HUD.
 */

import type { EvidenceHUDConfig } from "./types.js";

/** A single evidence entry from the ledger. */
export interface EvidenceEntry {
  id: string;
  timestamp: string;
  agentId: string;
  resource: string;
  action: string;
  tier: string;
  outcome: string;
  hash: string;
  previousHash?: string;
  reason?: string;
}

/**
 * Evidence HUD — manages a rolling window of evidence entries.
 */
export class EvidenceHUD {
  private readonly maxEntries: number;
  private readonly minTier: string;
  private entries: EvidenceEntry[] = [];
  private listeners: Array<(entry: EvidenceEntry) => void> = [];

  constructor(config: EvidenceHUDConfig) {
    this.maxEntries = config.maxEntries ?? 50;
    this.minTier = config.minTier ?? "T0";
  }

  /**
   * Add an evidence entry to the HUD.
   *
   * Automatically prunes old entries when the window is exceeded.
   */
  addEntry(entry: EvidenceEntry): void {
    // Filter by minimum tier
    if (!this.meetsTierThreshold(entry.tier)) return;

    this.entries.push(entry);

    // Prune oldest
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Don't let listener errors break the HUD
      }
    }
  }

  /**
   * Subscribe to new evidence entries.
   * Returns an unsubscribe function.
   */
  onEntry(callback: (entry: EvidenceEntry) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Get all current entries.
   */
  getEntries(): ReadonlyArray<EvidenceEntry> {
    return this.entries;
  }

  /**
   * Get entries filtered by tier.
   */
  getEntriesByTier(tier: string): EvidenceEntry[] {
    return this.entries.filter((e) => e.tier === tier);
  }

  /**
   * Get entries filtered by outcome.
   */
  getEntriesByOutcome(outcome: string): EvidenceEntry[] {
    return this.entries.filter((e) => e.outcome === outcome);
  }

  /**
   * Get summary statistics.
   */
  getStats(): {
    total: number;
    byTier: Record<string, number>;
    byOutcome: Record<string, number>;
  } {
    const byTier: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};

    for (const entry of this.entries) {
      byTier[entry.tier] = (byTier[entry.tier] ?? 0) + 1;
      byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
    }

    return { total: this.entries.length, byTier, byOutcome };
  }

  /**
   * Verify hash chain integrity of current entries.
   */
  verifyChainIntegrity(): {
    valid: boolean;
    brokenAt?: number;
  } {
    for (let i = 1; i < this.entries.length; i++) {
      const current = this.entries[i]!;
      const previous = this.entries[i - 1]!;

      if (current.previousHash && current.previousHash !== previous.hash) {
        return { valid: false, brokenAt: i };
      }
    }

    return { valid: true };
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get the count of entries.
   */
  get count(): number {
    return this.entries.length;
  }

  private meetsTierThreshold(tier: string): boolean {
    const tierOrder = ["T0", "T1", "T2", "T3"];
    const minIndex = tierOrder.indexOf(this.minTier);
    const entryIndex = tierOrder.indexOf(tier);
    return entryIndex >= minIndex;
  }
}
