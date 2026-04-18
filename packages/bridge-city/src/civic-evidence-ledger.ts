import { createHash } from 'crypto';

export interface CivicAction {
  actionType: string;
  actor: string;
  resource: string;
  timestamp: Date;
  tier: string;
}

export interface LedgerEntry {
  hash: string;
  previousHash: string;
  actionType: string;
  actor: string;
  resource: string;
  timestamp: Date;
  tier: string;
}

export class CivicEvidenceLedger {
  private entries: LedgerEntry[] = [];
  private lastHash = '0';

  addEntry(action: CivicAction): LedgerEntry {
    const entry: LedgerEntry = {
      hash: this.generateHash(action),
      previousHash: this.lastHash,
      actionType: action.actionType,
      actor: action.actor,
      resource: action.resource,
      timestamp: action.timestamp,
      tier: action.tier,
    };

    this.entries.push(entry);
    this.lastHash = entry.hash;

    return entry;
  }

  private generateHash(action: CivicAction): string {
    const combined = `${action.actionType}:${action.actor}:${action.resource}:${action.timestamp.toISOString()}:${this.lastHash}`;
    return createHash('sha256').update(combined).digest('hex');
  }

  getEntry(index: number): LedgerEntry | undefined {
    return this.entries[index];
  }

  getEntriesByActor(actor: string): LedgerEntry[] {
    return this.entries.filter((e) => e.actor === actor);
  }

  getEntriesByResource(resource: string): LedgerEntry[] {
    return this.entries.filter((e) => e.resource === resource);
  }

  getEntriesByAction(actionType: string): LedgerEntry[] {
    return this.entries.filter((e) => e.actionType === actionType);
  }

  verifyIntegrity(): boolean {
    if (this.entries.length === 0) return true;

    let expectedPrevious = '0';
    for (const entry of this.entries) {
      if (entry.previousHash !== expectedPrevious) {
        return false;
      }
      expectedPrevious = entry.hash;
    }

    return true;
  }

  verifyChain(): boolean {
    return this.verifyIntegrity();
  }

  exportPublicAudit(): Array<{ actionType: string; timestamp: Date; tier: string }> {
    return this.entries.map((e) => ({
      actionType: e.actionType,
      timestamp: e.timestamp,
      tier: e.tier,
    }));
  }

  exportForFOIA(fromDate?: Date): Array<{ actionType: string; timestamp: Date; anonymizedActor: string }> {
    let filtered = this.entries;
    if (fromDate) {
      filtered = this.entries.filter((e) => e.timestamp > fromDate);
    }

    return filtered.map((e) => ({
      actionType: e.actionType,
      timestamp: e.timestamp,
      anonymizedActor: this.hashActor(e.actor),
    }));
  }

  getStats(): {
    totalEntries: number;
    uniqueActors: number;
    uniqueResources: number;
    dateRange: { start: Date; end: Date } | null;
  } {
    if (this.entries.length === 0) {
      return {
        totalEntries: 0,
        uniqueActors: 0,
        uniqueResources: 0,
        dateRange: null,
      };
    }

    const actors = new Set(this.entries.map((e) => e.actor));
    const resources = new Set(this.entries.map((e) => e.resource));
    const sorted = [...this.entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      totalEntries: this.entries.length,
      uniqueActors: actors.size,
      uniqueResources: resources.size,
      dateRange: {
        start: sorted[0]!.timestamp,
        end: sorted[sorted.length - 1]!.timestamp,
      },
    };
  }

  private hashActor(actor: string): string {
    return createHash('sha256').update(actor).digest('hex').substring(0, 8);
  }

  getAllEntries(): LedgerEntry[] {
    return [...this.entries];
  }
}
