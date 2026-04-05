import type { MemoryEntry } from "./types.js";
import type { WorkingMemory } from "./working-memory.js";
import type { OperatorMemory } from "./operator-memory.js";

export class MemoryBank {
  constructor(
    private readonly working: WorkingMemory,
    private readonly persistent: OperatorMemory,
  ) {}

  async store(key: string, value: unknown, tags: readonly string[] = [], persist = false): Promise<MemoryEntry> {
    if (persist) {
      const entry = await this.persistent.store(key, value, tags);
      this.working.push(key, value, tags); // also cache in working memory
      return entry;
    }
    return this.working.push(key, value, tags);
  }

  async recall(query: string, limit = 10): Promise<MemoryEntry[]> {
    const [workingResults, persistentResults] = await Promise.all([
      Promise.resolve(this.working.search(query)),
      this.persistent.recall(query, limit),
    ]);

    // Merge, deduplicate by key (persistent wins for same key)
    const seen = new Set<string>();
    const merged: MemoryEntry[] = [];
    for (const entry of [...persistentResults, ...workingResults]) {
      if (!seen.has(entry.key)) {
        seen.add(entry.key);
        merged.push(entry);
      }
    }
    return merged.slice(0, limit);
  }

  async forget(key: string): Promise<void> {
    await this.persistent.forget(key);
    this.working.clear(); // simple: clear all working memory on forget
  }

  get workingSize(): number {
    return this.working.size;
  }

  get persistentSize(): number {
    return this.persistent.size;
  }
}
