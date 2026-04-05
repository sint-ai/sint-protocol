import type { MemoryEntry } from "./types.js";
import { nowISO8601 } from "@sint/gate-capability-tokens";

export class WorkingMemory {
  private readonly entries: MemoryEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  push(key: string, value: unknown, tags: readonly string[] = []): MemoryEntry {
    const entry: MemoryEntry = {
      key,
      value,
      tags,
      storedAt: nowISO8601(),
      source: "working",
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.shift(); // drop oldest
    }
    return entry;
  }

  getRecent(n: number): MemoryEntry[] {
    return this.entries.slice(-n);
  }

  getByKey(key: string): MemoryEntry | undefined {
    // Return most recent entry with this key
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]!.key === key) return this.entries[i];
    }
    return undefined;
  }

  search(query: string): MemoryEntry[] {
    const q = query.toLowerCase();
    const results: Array<{ entry: MemoryEntry; score: number }> = [];

    for (const entry of this.entries) {
      let score = 0;
      if (entry.key.toLowerCase().includes(q)) score += 2;
      if (typeof entry.value === "string" && entry.value.toLowerCase().includes(q)) score += 1;
      for (const tag of entry.tags) {
        if (tag.toLowerCase().includes(q)) score += 1;
      }
      if (score > 0) results.push({ entry, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .map((r) => r.entry);
  }

  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }
}
