import type { MemoryEntry } from "./types.js";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";
import type { SintEventType } from "@pshkv/core";

// Minimal interface for what we need from LedgerWriter
// (avoids tight coupling to evidence-ledger internals)
export interface LedgerWriterLike {
  append(input: {
    eventType: SintEventType;
    agentId: string;
    payload: Record<string, unknown>;
  }): { eventId: string } | Promise<{ eventId: string }> | unknown;
}

export class OperatorMemory {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly deleted = new Set<string>();

  constructor(
    private readonly ledger: LedgerWriterLike,
    private readonly agentId: string,
  ) {}

  async store(key: string, value: unknown, tags: readonly string[] = []): Promise<MemoryEntry> {
    const eventId = generateUUIDv7();
    const timestamp = nowISO8601();

    const entry: MemoryEntry = {
      key,
      value,
      tags,
      storedAt: timestamp,
      source: "operator",
      ledgerEventId: eventId,
    };
    this.entries.set(key, entry);
    this.deleted.delete(key);

    await Promise.resolve(
      this.ledger.append({
        eventType: "operator.memory.stored",
        agentId: this.agentId,
        payload: { key, value: typeof value === "string" ? value : JSON.stringify(value), tags },
      }),
    );

    return entry;
  }

  async recall(query: string, limit = 10): Promise<MemoryEntry[]> {
    const q = query.toLowerCase();
    const results: Array<{ entry: MemoryEntry; score: number }> = [];

    for (const [, entry] of this.entries) {
      if (this.deleted.has(entry.key)) continue;
      let score = 0;
      if (entry.key.toLowerCase().includes(q)) score += 2;
      if (typeof entry.value === "string" && entry.value.toLowerCase().includes(q)) score += 1;
      for (const tag of entry.tags) {
        if (tag.toLowerCase().includes(q)) score += 1;
      }
      if (score > 0) results.push({ entry, score });
    }

    const recalled = results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.entry);

    if (recalled.length > 0) {
      await Promise.resolve(
        this.ledger.append({
          eventType: "operator.memory.recalled",
          agentId: this.agentId,
          payload: { query, resultCount: recalled.length, keys: recalled.map((e) => e.key) },
        }),
      );
    }

    return recalled;
  }

  async forget(key: string): Promise<boolean> {
    if (!this.entries.has(key)) return false;
    this.deleted.add(key);

    await Promise.resolve(
      this.ledger.append({
        eventType: "operator.memory.deleted",
        agentId: this.agentId,
        payload: { key, tombstone: true },
      }),
    );

    return true;
  }

  getAll(): MemoryEntry[] {
    return Array.from(this.entries.values()).filter((e) => !this.deleted.has(e.key));
  }

  get size(): number {
    return this.entries.size - this.deleted.size;
  }
}
